import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMAC-SHA256 signature verification
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );
    
    const computedSignature = 'sha256=' + Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return computedSignature === signature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

serve(async (req) => {
  const FACEBOOK_WEBHOOK_VERIFY_TOKEN = Deno.env.get('FACEBOOK_WEBHOOK_VERIFY_TOKEN');
  const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');

  // Handle GET request - Webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('Webhook verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token === FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook verified successfully');
      return new Response(challenge, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    } else {
      console.error('Webhook verification failed - token mismatch');
      return new Response('Forbidden', { status: 403 });
    }
  }

  // Handle OPTIONS request - CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle POST request - Webhook events
  if (req.method === 'POST') {
    try {
      const signature = req.headers.get('x-hub-signature-256');
      const body = await req.text();

      console.log('Received webhook event');
      console.log('Signature:', signature);

      // Verify signature if secret is configured
      if (FACEBOOK_APP_SECRET && signature) {
        const isValid = await verifySignature(body, signature, FACEBOOK_APP_SECRET);
        
        if (!isValid) {
          console.error('Invalid webhook signature');
          // Still return 200 to prevent Facebook from retrying
          return new Response('OK', { status: 200 });
        }
        
        console.log('Webhook signature verified');
      }

      // Parse and log the payload
      const payload = JSON.parse(body);
      console.log('Webhook payload:', JSON.stringify(payload, null, 2));

      // Process different event types
      if (payload.object === 'instagram') {
        console.log('Instagram event received');
        
        for (const entry of payload.entry || []) {
          console.log('Entry ID:', entry.id);
          
          // Handle different change types
          for (const change of entry.changes || []) {
            console.log('Change field:', change.field);
            console.log('Change value:', JSON.stringify(change.value, null, 2));
          }
          
          // Handle messaging events
          if (entry.messaging) {
            for (const message of entry.messaging) {
              console.log('Message event:', JSON.stringify(message, null, 2));
            }
          }
        }
      }

      // Always return 200 OK to acknowledge receipt
      return new Response('OK', { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      // Still return 200 to prevent Facebook from retrying
      return new Response('OK', { status: 200 });
    }
  }

  // Method not allowed
  return new Response('Method not allowed', { status: 405 });
});
