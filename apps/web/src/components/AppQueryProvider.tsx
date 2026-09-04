"use client";

import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {createContext, useEffect, useRef, useState, type ReactNode} from "react";
import {useCurrentAccount} from "./account/CurrentAccountProvider";

export const AppQueryContext = createContext(false);

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });
}

function isPrivateAppQuery(query: {queryKey: readonly unknown[]}) {
  const [domain, scope] = query.queryKey;
  return domain === "my-profile" || domain === "human-chat" || domain === "ai-chat" || domain === "notifications" || (domain === "home-feed" && scope !== "public");
}

export function AppQueryProvider({children, client: providedClient}: {children: ReactNode; client?: QueryClient}) {
  const [ownedClient] = useState(createAppQueryClient);
  const client = providedClient ?? ownedClient;
  const {account, status} = useCurrentAccount();
  const previousAccount = useRef<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    const nextAccount = account ? `${account.kind}:${account.id}` : null;
    if (previousAccount.current && previousAccount.current !== nextAccount)
      client.removeQueries({predicate: isPrivateAppQuery});
    previousAccount.current = nextAccount;
  }, [account?.id, account?.kind, client, status]);

  return <QueryClientProvider client={client}><AppQueryContext.Provider value>{children}</AppQueryContext.Provider></QueryClientProvider>;
}
