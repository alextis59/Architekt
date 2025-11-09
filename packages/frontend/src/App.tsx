const App = () => {
  return (
    <main className="app">
      <header>
        <h1>Architekt</h1>
        <p className="lead">Design and explore system architectures collaboratively.</p>
      </header>
      <section>
        <h2>Phase 1 Toolkit</h2>
        <p>
          The project now ships with a TypeScript-powered Express API, shared domain models, and a React
          frontend scaffold so future phases can focus on product features instead of boilerplate.
        </p>
        <ul>
          <li>Start the API with <code>npm run start:backend</code>.</li>
          <li>Run <code>npm run dev --workspace @architekt/frontend</code> to preview the React app.</li>
          <li>Check lint, tests, and builds via <code>npm run lint</code>, <code>npm test</code>, and <code>npm run build</code>.</li>
        </ul>
      </section>
    </main>
  );
};

export default App;
