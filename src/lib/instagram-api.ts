// Instagram Graph API Integration
// https://developers.facebook.com/docs/instagram-api

interface InstagramCredentials {
  access_token: string;
  user_id: string;
  instagram_business_account_id: string;
  expires_at: number;
  username?: string;
}

const STORAGE_KEY = "instagram_credentials";

// Get Instagram credentials from LocalStorage
export const getInstagramCredentials = (): InstagramCredentials | null => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  try {
    const credentials = JSON.parse(stored);
    
    // Check if token expired
    if (credentials.expires_at && Date.now() > credentials.expires_at) {
      clearInstagramCredentials();
      return null;
    }
    
    return credentials;
  } catch {
    return null;
  }
};

// Save Instagram credentials to LocalStorage
export const saveInstagramCredentials = (credentials: InstagramCredentials) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
};

// Clear Instagram credentials
export const clearInstagramCredentials = () => {
  localStorage.removeItem(STORAGE_KEY);
};

// Check if user is connected to Instagram
export const isInstagramConnected = (): boolean => {
  return getInstagramCredentials() !== null;
};

// Initiate Instagram OAuth flow
export const connectInstagram = (appId: string, redirectUri: string) => {
  const scope = [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_insights",
    "pages_read_engagement"
  ].join(",");
  
  const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
  
  // Open OAuth in same window
  window.location.href = authUrl;
};

// Handle OAuth callback (exchange code for token)
export const handleOAuthCallback = async (
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Exchange code for short-lived token
    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const tokenData = await tokenResponse.json();
    
    // Exchange short-lived token for long-lived token (60 days)
    const longLivedResponse = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`
    );

    if (!longLivedResponse.ok) {
      throw new Error("Failed to get long-lived token");
    }

    const longLivedData = await longLivedResponse.json();
    
    // Get Instagram Business Account ID
    const accountResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${longLivedData.access_token}`
    );

    if (!accountResponse.ok) {
      throw new Error("Failed to get account info");
    }

    const accountData = await accountResponse.json();
    
    // Save credentials
    const credentials: InstagramCredentials = {
      access_token: longLivedData.access_token,
      user_id: accountData.id,
      instagram_business_account_id: accountData.id,
      username: accountData.username,
      expires_at: Date.now() + (longLivedData.expires_in * 1000), // Convert to milliseconds
    };
    
    saveInstagramCredentials(credentials);
    
    return { success: true };
  } catch (error: any) {
    console.error("OAuth error:", error);
    return { success: false, error: error.message };
  }
};

// Disconnect Instagram account
export const disconnectInstagram = () => {
  clearInstagramCredentials();
};
