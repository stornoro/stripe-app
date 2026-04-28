export type ExtensionContextValue = {
  userContext?: {
    id: string
    email?: string
    name?: string
    account: { id: string; name: string }
    permissions: string[]
  }
  environment?: {
    mode: 'live' | 'test'
    viewportID: string
    objectContext: { id: string; object: string }
  }
}

export const useRefreshDashboardData = () => async () => {}
