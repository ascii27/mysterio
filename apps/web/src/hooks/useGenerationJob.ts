import { useQuery } from "@tanstack/react-query";
import { TERMINAL_STATUSES } from "@mysterio/shared";
import { getMystery } from "../api/mysteries.js";

export function useGenerationJob(mysteryId: string) {
  return useQuery({
    queryKey: ["mystery", mysteryId],
    queryFn: () => getMystery(mysteryId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || (TERMINAL_STATUSES as readonly string[]).includes(status)) return false;
      return 2000;
    },
    refetchIntervalInBackground: false,
  });
}
