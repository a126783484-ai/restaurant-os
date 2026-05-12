import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getToken } from "@/hooks/use-auth";
import { API_BASE_URL } from "@/lib/api-env";

export function configureApiClient(): void {
  setBaseUrl(API_BASE_URL);
  setAuthTokenGetter(getToken);
}
