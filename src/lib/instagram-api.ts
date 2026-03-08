// Instagram OAuth callback handler (legacy)
export async function handleOAuthCallback(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // This legacy flow is no longer used - OAuth is handled via edge functions
    console.warn('Legacy OAuth callback called - use edge function flow instead');
    return { success: false, error: 'Use the new OAuth flow via Settings page' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
