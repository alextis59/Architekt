# Deploying Architekt to Google Cloud Run with Cloudflare

This guide walks through everything required to containerize the Architekt backend, deploy it to Google Cloud Run, and expose the service through a Cloudflare managed domain or tunnel. Follow the sections in order on a fresh Google Cloud project.

## 1. Architecture overview

- **Container image** – The repository ships with a production-ready `Dockerfile` that builds the monorepo, prunes development dependencies, and runs the backend from the compiled output on port `8080` (Cloud Run's default).
- **Artifact Registry** – Container images are stored in a regional [Artifact Registry](https://cloud.google.com/artifact-registry) repository.
- **Cloud Run service** – Deployments run on the fully managed Cloud Run platform with optional filesystem or MongoDB persistence (MongoDB Atlas or a managed instance is recommended for production data).
- **Continuous deployment** – GitHub Actions builds the container, pushes it to Artifact Registry, and deploys Cloud Run whenever `main` is updated.
- **Cloudflare access** – Cloudflare serves the public domain through either an HTTPS proxy to the Cloud Run HTTPS endpoint or a private tunnel managed by `cloudflared`.

## 2. Google Cloud project preparation

All commands below assume you have the [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated with a user that can administer the target project.

```bash
PROJECT_ID="your-gcp-project-id"
REGION="us-central1"        # choose any Cloud Run supported region
REPOSITORY="architekt"      # Artifact Registry repository name
SERVICE="architekt-backend" # Cloud Run service name
```

1. **Enable required services**

   ```bash
   gcloud services enable \
     run.googleapis.com \
     artifactregistry.googleapis.com
   ```

2. **Create the Artifact Registry repository** (skip if it already exists).

   ```bash
   gcloud artifacts repositories create "$REPOSITORY" \
     --repository-format=docker \
     --location="$REGION" \
     --description="Architekt container images"
   ```

3. **Create the deployment service account.**

   ```bash
   gcloud iam service-accounts create architekt-deployer \
     --display-name="Architekt Cloud Run deployer"
   ```

4. **Grant minimum roles** to the service account (replace `$SERVICE_ACCOUNT_EMAIL` with the email from the previous step).

   ```bash
   SERVICE_ACCOUNT_EMAIL="architekt-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
     --role="roles/run.admin"

   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
     --role="roles/iam.serviceAccountUser"

   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
     --role="roles/artifactregistry.writer"
   ```

5. **(Recommended) Configure Workload Identity Federation** so GitHub can impersonate the service account without storing JSON keys.

   ```bash
   # Create or reuse a Workload Identity pool
   gcloud iam workload-identity-pools create architekt-github-pool \
     --location="global" \
     --display-name="GitHub Actions pool"

   POOL_ID="architekt-github-pool"

   gcloud iam workload-identity-pools providers create-oidc github-provider \
     --location="global" \
     --workload-identity-pool="$POOL_ID" \
     --display-name="GitHub provider" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --issuer-uri="https://token.actions.githubusercontent.com"

   gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
     --role="roles/iam.workloadIdentityUser" \
     --member="principalSet://iam.googleapis.com/projects/${PROJECT_ID}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/<OWNER>/<REPO>"
   ```

   Replace `<OWNER>` and `<REPO>` with your GitHub organization/user and repository names. Note the following values—they are required when wiring up the GitHub Actions workflow:

   - Workload Identity Provider resource name: `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/${POOL_ID}/providers/github-provider`
   - Service account email: `${SERVICE_ACCOUNT_EMAIL}`

   > **Using service account keys?** If you cannot use Workload Identity Federation, create a JSON key (`gcloud iam service-accounts keys create key.json --iam-account "$SERVICE_ACCOUNT_EMAIL"`) and store its contents in the `GCP_SERVICE_ACCOUNT_KEY` GitHub secret. The workflow automatically uses the JSON key when the Workload Identity inputs are absent.

## 3. Configure repository variables and secrets

Set the following [repository variables](https://docs.github.com/en/actions/learn-github-actions/variables) in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Example value | Purpose |
| --- | --- | --- |
| `GCP_PROJECT_ID` | `my-architekt-project` | Google Cloud project that hosts Cloud Run |
| `GCP_REGION` | `us-central1` | Region that contains the Artifact Registry repo and Cloud Run service |
| `GCP_ARTIFACT_REPOSITORY` | `architekt` | Artifact Registry Docker repository name |
| `CLOUD_RUN_SERVICE` | `architekt-backend` | Cloud Run service name |

Add these secrets in **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Purpose |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity provider resource path (omit if you will use a key) |
| `GCP_SERVICE_ACCOUNT` | Deployment service account email |
| `GCP_SERVICE_ACCOUNT_KEY` | *(Optional)* JSON service account key. Only required when not using Workload Identity Federation. |

Once these values are present, every push to `main` automatically triggers a container build, push, and deployment.

## 4. Cloud Run environment configuration

1. **Create the initial service** (only needed the first time). The GitHub workflow updates the service after it exists.

   ```bash
   IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:initial"

   docker build -t "$IMAGE_URI" .
   gcloud auth configure-docker "${REGION}-docker.pkg.dev"
   docker push "$IMAGE_URI"

   gcloud run deploy "$SERVICE" \
     --project="$PROJECT_ID" \
     --region="$REGION" \
     --image="$IMAGE_URI" \
     --platform=managed \
     --allow-unauthenticated \
     --memory=512Mi \
     --port=8080
   ```

2. **Set environment variables** either via the Cloud Console or CLI:

   ```bash
   gcloud run services update "$SERVICE" \
     --project="$PROJECT_ID" \
     --region="$REGION" \
     --set-env-vars="PERSISTENCE_DRIVER=filesystem" \
     --set-env-vars="AUTH_MODE=local"
   ```

   - `PERSISTENCE_DRIVER=filesystem` uses ephemeral storage. For production, prefer `mongo` along with `MONGO_URI`, `MONGO_DATABASE`, and `MONGO_COLLECTION`.
   - To use Google Sign-In, provide `AUTH_MODE=google` and `GOOGLE_CLIENT_ID`.

3. **Review Cloud Run revisions** after the GitHub workflow deploys. Each push to `main` produces a new container image tagged with the commit SHA.

## 5. GitHub Actions deployment pipeline

The existing `.github/workflows/ci.yml` workflow now contains a `container` job that runs on `main` pushes once all tests succeed:

1. Authenticate with Google Cloud via Workload Identity Federation or a service account key.
2. Configure Docker to use Artifact Registry.
3. Build the container image using the repository `Dockerfile`.
4. Push the tagged image (`${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${GITHUB_SHA}`) to Artifact Registry.
5. Deploy the new revision to Cloud Run and route 100% of traffic to it.

If required, you can redeploy a previous image manually:

```bash
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:<commit-sha>"

gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --platform=managed
```

## 6. Cloudflare domain and tunnel integration

You can expose the Cloud Run service through Cloudflare in two primary ways.

### Option A – Direct HTTPS proxy

1. Add your domain to Cloudflare.
2. Create a DNS record (for example, `api.example.com`) that proxies traffic to the public HTTPS endpoint of your Cloud Run service (e.g., `https://architekt-backend-<hash>-uc.a.run.app`).
3. Cloudflare automatically provisions TLS certificates and forwards requests to Cloud Run.

This option is the simplest, but your Cloud Run service remains publicly accessible.

### Option B – Cloudflare Tunnel (recommended)

Cloudflare Tunnel allows you to keep the Cloud Run service private and rely on an authenticated tunnel connection initiated from a trusted environment (e.g., a small VM, Cloud Run job, or Cloudflare's managed tunnel infrastructure).

1. Install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) in the environment that will run the tunnel.
2. Authenticate with your Cloudflare account and create the tunnel:

   ```bash
   cloudflared tunnel login
   cloudflared tunnel create architekt-cloud-run
   ```

3. Create a routing configuration (see [`deploy/cloudflared/config.example.yaml`](../../deploy/cloudflared/config.example.yaml)). Update the placeholder values:

   ```yaml
   tunnel: architekt-cloud-run
   credentials-file: /etc/cloudflared/architekt-cloud-run.json

   ingress:
     - hostname: api.example.com
       service: https://architekt-backend-<hash>-uc.a.run.app
     - service: http_status:404
   ```

4. Add the DNS route so Cloudflare knows to send traffic through the tunnel:

   ```bash
   cloudflared tunnel route dns architekt-cloud-run api.example.com
   ```

5. Run the tunnel as a long-lived service:

   ```bash
   cloudflared tunnel run architekt-cloud-run --config /etc/cloudflared/config.yaml
   ```

   Cloudflare's Zero Trust dashboard can also manage the tunnel as a managed worker without hosting `cloudflared` yourself.

6. (Optional) Apply Zero Trust policies such as Access policies for authenticated users.

## 7. Verifying the deployment

1. Visit the Cloud Run service URL or your Cloudflare hostname and confirm you see the Architekt backend health endpoint (`GET /health`).
2. Check Cloud Run logs for the `Architekt backend listening on port 8080` message.
3. Trigger the GitHub Actions workflow from a feature branch merge and confirm a new revision appears in Cloud Run.

With the container, workflow automation, and Cloudflare integration in place, the project is production-ready on Google Cloud Run.
