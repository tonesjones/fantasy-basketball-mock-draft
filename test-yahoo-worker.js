/* Runs the Yahoo Worker tests (ES modules) under npm test. */
import("./tools/yahoo-copilot/worker/test-worker.mjs")
  .then(function () {
    return import("./tools/yahoo-copilot/worker/test-news.mjs");
  })
  .catch(function (error) {
    console.error(error);
    process.exit(1);
  });
