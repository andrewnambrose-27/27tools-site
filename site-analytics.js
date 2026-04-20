(function () {
  fetch("https://analytics.27tools.co/collect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      path: window.location.pathname
    }),
    keepalive: true
  }).catch(() => {});
})();
