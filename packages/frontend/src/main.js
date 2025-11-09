const app = document.querySelector('#app');

if (app) {
  app.innerHTML = `
    <main>
      <h1>Architekt</h1>
      <p class="lead">Architecture design sandbox coming soon.</p>
      <section>
        <h2>Getting Started</h2>
        <ol>
          <li>Start the backend server with <code>npm run start:backend</code>.</li>
          <li>Open this page with a simple static server.</li>
          <li>Build flows and systems once the API is ready.</li>
        </ol>
      </section>
    </main>
  `;
}
