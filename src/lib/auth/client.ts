"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

// Browser-side auth calls (sign in, sign out). Same origin, so no baseURL needed.
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});
