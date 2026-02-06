(() => {
  if (!window.AppController || typeof window.AppController.init !== "function") {
    console.error("App bootstrap failed: AppController.init is unavailable. Check script order in index.html.");
    return;
  }
  window.AppController.init();
})();
