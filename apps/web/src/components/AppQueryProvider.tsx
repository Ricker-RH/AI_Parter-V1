"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCurrentAccount } from "./account/CurrentAccountProvider";

function createClient() {
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

export function AppQueryProvider({ children, client: providedClient }: { children: ReactNode; client?: QueryClient }) {
  const [ownedClient] = useState(createClient);
  const client = providedClient ?? ownedClient;
  const { account, status } = useCurrentAccount();
  const previousHumanId = useRef<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    const nextHumanId = account?.kind === "human" ? account.id : null;
    if (previousHumanId.current && previousHumanId.current !== nextHumanId)
      client.removeQueries({ queryKey: ["human-chat", previousHumanId.current] });
    previousHumanId.current = nextHumanId;
  }, [account?.id, account?.kind, client, status]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
