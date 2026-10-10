(() => {
  const API_URL = "https://rapid-shark-565.convex.cloud";
  const BOARD_ID = document.documentElement?.dataset.warRoomBoard || "war-room-10012026";
  const AUTH_QUERY = BOARD_ID === "war-room-10012026" ? "warRoom:verify" : "warRoom:get";
  const PUBLISHABLE_KEY = "pk_live_Y2xlcmsuam9obi10YS5jb20k";
  const CLERK_ORIGIN = "https://clerk.john-ta.com";
  let callbacks;
  let sessionId = null;
  let verifiedSessionId = null;
  let generation = 0;
  let clerkReady = false;
  let mounted = false;
  const status = () => document.querySelector("#authStatus");

  function lock(message) {
    verifiedSessionId = null;
    callbacks?.onLocked();
    status().hidden = false;
    status().textContent = message;
    document.querySelector("#authSignOut").hidden = !window.Clerk?.session;
  }

  function isAuthorized() {
    return Boolean(verifiedSessionId && window.Clerk?.session?.id === verifiedSessionId);
  }

  async function tokenFor(session) {
    const token = await session.getToken();
    let audience;
    try {
      const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      audience = JSON.parse(atob(payload)).aud;
    } catch { /* The server, not this decode, verifies the token. */ }
    if (audience === "convex" || (Array.isArray(audience) && audience.includes("convex"))) return token;
    return session.getToken({ template: "convex" });
  }

  async function call(kind, path, args) {
    const session = window.Clerk?.session;
    const checkingAccess = kind === "query" && path === AUTH_QUERY && args?.boardId === BOARD_ID;
    if (!session || (!checkingAccess && !isAuthorized())) {
      lock("Please sign in to continue.");
      throw new Error("UNAUTHENTICATED");
    }
    const currentId = session.id;
    let token;
    try { token = await tokenFor(session); } catch {
      if (window.Clerk?.session?.id === currentId) lock("Your session needs to be refreshed. Please sign in again.");
      throw new Error("UNAUTHENTICATED");
    }
    if (window.Clerk?.session?.id !== currentId) throw new Error("Session changed");
    if (!token) {
      lock("Your session expired. Please sign in again.");
      throw new Error("UNAUTHENTICATED");
    }
    const response = await fetch(`${API_URL}/api/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path, args }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (window.Clerk?.session?.id !== currentId) throw new Error("Session changed");
    if (!response.ok || result.status !== "success") {
      const code = result.errorData?.code;
      if (code === "FORBIDDEN") lock(BOARD_ID === "war-room-10012026" ? "This account isn’t approved for this war room. Sign in with your approved affil.ai email." : "This archive is available only to the site owner. Use your approved owner account.");
      else if (code === "UNAUTHENTICATED" || response.status === 401 || /InvalidAuthHeader|Unauthenticated|InvalidAuthToken/.test(result.code || "")) lock("Please sign in with a verified email to continue.");
      throw new Error(code || "Unable to connect to the war room.");
    }
    return result.value;
  }

  function mountSignIn() {
    if (mounted) return;
    window.Clerk.mountSignIn(document.querySelector("#clerkSignIn"), {
      routing: "hash",
      withSignUp: true,
      forceRedirectUrl: location.href.split("#")[0],
      signUpForceRedirectUrl: location.href.split("#")[0],
      appearance: { variables: {
        colorPrimary: "#245346", colorBackground: "#ffffff", colorText: "#202c29",
        colorInputBackground: "#fafbf8", borderRadius: "8px",
        fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      } },
    });
    mounted = true;
    status().hidden = true;
  }

  async function handleSession(session) {
    const nextId = session?.id || null;
    if (nextId === sessionId && (verifiedSessionId || !nextId)) return;
    sessionId = nextId;
    const currentGeneration = ++generation;
    lock(session ? "Checking your access…" : "Sign in with your approved account.");
    if (!session) {
      mountSignIn();
      return;
    }
    if (mounted) {
      window.Clerk.unmountSignIn(document.querySelector("#clerkSignIn"));
      mounted = false;
    }
    try {
      const viewer = await call("query", AUTH_QUERY, { boardId: BOARD_ID });
      if (currentGeneration !== generation || window.Clerk?.session?.id !== nextId) return;
      verifiedSessionId = nextId;
      await callbacks.onAuthorized(viewer);
    } catch (error) {
      if (currentGeneration !== generation) return;
      if (!/FORBIDDEN|UNAUTHENTICATED/.test(error.message)) {
        lock("Secure sign-in couldn’t finish. Please retry.");
      }
      document.querySelector("#authRetry").hidden = false;
    }
  }

  function loadScript(src, publishableKey) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.crossOrigin = "anonymous";
      if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error("Sign-in could not load")); };
      document.head.append(script);
    });
  }

  async function initialize() {
    document.querySelector("#authRetry").hidden = true;
    lock("Loading secure sign-in…");
    if (location.hostname !== "john-ta.com" && location.hostname !== "www.john-ta.com") {
      status().textContent = "Clerk sign-in requires john-ta.com. Open the hosted war room once this version is deployed.";
      document.querySelector("#hostedSignIn").hidden = false;
      return;
    }
    try {
      if (!clerkReady) {
        if (!window.__internal_ClerkUICtor) await loadScript(`${CLERK_ORIGIN}/npm/@clerk/ui@1/dist/ui.browser.js`);
        if (!window.Clerk) await loadScript(`${CLERK_ORIGIN}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, PUBLISHABLE_KEY);
        await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
        clerkReady = true;
        window.Clerk.addListener(({ session }) => {
          if ((session?.id || null) !== sessionId) void handleSession(session);
        });
      }
      // A signed-out first load needs the widget even though sessionId is null.
      if (!window.Clerk.session) mountSignIn();
      else await handleSession(window.Clerk.session);
    } catch {
      lock("Secure sign-in could not load. Check your connection and retry.");
      document.querySelector("#authRetry").hidden = false;
    }
  }

  async function signOut() {
    generation += 1;
    sessionId = null;
    lock("Signing out…");
    await window.Clerk?.signOut();
    location.assign(location.href.split("#")[0]);
  }

  window.WarRoomAuth = {
    call, isAuthorized, signOut,
    start(handlers) {
      callbacks = handlers;
      document.querySelector("#authRetry").addEventListener("click", () => {
        sessionId = null;
        void initialize();
      });
      document.querySelector("#authSignOut").addEventListener("click", () => void signOut());
      return initialize();
    },
  };
})();
