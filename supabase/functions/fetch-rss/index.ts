import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Feeds RSS de sites de tecnologia brasileiros
const DEFAULT_FEEDS = [
  { name: 'Olhar Digital', url: 'https://olhardigital.com.br/feed/' },
  { name: 'TecMundo', url: 'https://rss.tecmundo.com.br/feed' },
  { name: 'Canaltech', url: 'https://canaltech.com.br/rss/' },
  { name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/' },
  { name: 'Gizmodo Brasil', url: 'https://gizmodo.uol.com.br/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
];

interface RssItem {
  title: string;
  description: string;
  link: string;
  imageUrl: string | null;
  publishedAt: string | null;
  sourceName: string;
  sourceUrl: string;
}

// Parse RSS/Atom XML and extract items
function parseRssFeed(xml: string, feedName: string, feedUrl: string): RssItem[] {
  const items: RssItem[] = [];
  
  try {
    // Try RSS 2.0 format first
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      
      // Extract title
      const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const title = titleMatch ? cleanCDATA(titleMatch[1]) : '';
      
      // Extract description
      const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
      const description = descMatch ? cleanCDATA(descMatch[1]).substring(0, 500) : '';
      
      // Extract link
      const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      const link = linkMatch ? cleanCDATA(linkMatch[1]).trim() : '';
      
      // Extract published date
      const pubDateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      const dcDateMatch = itemXml.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);
      const publishedAt = pubDateMatch ? pubDateMatch[1].trim() : 
                          dcDateMatch ? dcDateMatch[1].trim() : null;
      
      // Extract image from multiple possible sources
      let imageUrl: string | null = null;
      
      // 1. media:content
      const mediaMatch = itemXml.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
      if (mediaMatch) imageUrl = mediaMatch[1];
      
      // 2. media:thumbnail
      if (!imageUrl) {
        const thumbMatch = itemXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i);
        if (thumbMatch) imageUrl = thumbMatch[1];
      }
      
      // 3. enclosure (podcasts/media)
      if (!imageUrl) {
        const enclosureMatch = itemXml.match(/<enclosure[^>]*url=["']([^"']+\.(jpg|jpeg|png|gif|webp)[^"']*)["'][^>]*(type=["']image[^"']*["'])?[^>]*>/i);
        if (enclosureMatch) imageUrl = enclosureMatch[1];
      }
      
      // 4. Image inside content:encoded
      if (!imageUrl) {
        const contentMatch = itemXml.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i);
        if (contentMatch) {
          const imgMatch = contentMatch[1].match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
          if (imgMatch) imageUrl = imgMatch[1];
        }
      }
      
      // 5. Image inside description
      if (!imageUrl) {
        const imgInDesc = description.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
        if (imgInDesc) imageUrl = imgInDesc[1];
      }
      
      // 6. itunes:image
      if (!imageUrl) {
        const itunesMatch = itemXml.match(/<itunes:image[^>]*href=["']([^"']+)["'][^>]*>/i);
        if (itunesMatch) imageUrl = itunesMatch[1];
      }
      
      if (title && link) {
        items.push({
          title: stripHtml(title),
          description: stripHtml(description),
          link,
          imageUrl,
          publishedAt,
          sourceName: feedName,
          sourceUrl: feedUrl,
        });
      }
    }
    
    // If no RSS items found, try Atom format
    if (items.length === 0) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      
      while ((match = entryRegex.exec(xml)) !== null) {
        const entryXml = match[1];
        
        const titleMatch = entryXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const title = titleMatch ? cleanCDATA(titleMatch[1]) : '';
        
        const summaryMatch = entryXml.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
        const contentMatch = entryXml.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i);
        const description = summaryMatch ? cleanCDATA(summaryMatch[1]).substring(0, 500) : 
                           contentMatch ? cleanCDATA(contentMatch[1]).substring(0, 500) : '';
        
        const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
        const link = linkMatch ? linkMatch[1] : '';
        
        const publishedMatch = entryXml.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
        const updatedMatch = entryXml.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);
        const publishedAt = publishedMatch ? publishedMatch[1].trim() : 
                           updatedMatch ? updatedMatch[1].trim() : null;
        
        // Try to find image in Atom
        let imageUrl: string | null = null;
        const mediaMatch = entryXml.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
        if (mediaMatch) imageUrl = mediaMatch[1];
        
        if (!imageUrl) {
          const imgMatch = description.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
          if (imgMatch) imageUrl = imgMatch[1];
        }
        
        if (title && link) {
          items.push({
            title: stripHtml(title),
            description: stripHtml(description),
            link,
            imageUrl,
            publishedAt,
            sourceName: feedName,
            sourceUrl: feedUrl,
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error parsing RSS from ${feedName}:`, error);
  }
  
  return items;
}

function cleanCDATA(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .trim();
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, feeds, saveToDb = true, limit = 10 } = await req.json();
    
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'userId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const feedsToFetch = feeds && feeds.length > 0 ? feeds : DEFAULT_FEEDS;
    console.log(`[RSS] Fetching ${feedsToFetch.length} feeds for user ${userId}`);
    
    const allItems: RssItem[] = [];
    const errors: string[] = [];
    
    // Fetch all feeds in parallel
    const feedPromises = feedsToFetch.map(async (feed: { name: string; url: string }) => {
      try {
        console.log(`[RSS] Fetching: ${feed.name}`);
        
        const response = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NeuralUpdate/1.0; +https://neuralupdate.app)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const xml = await response.text();
        const items = parseRssFeed(xml, feed.name, feed.url);
        
        console.log(`[RSS] ${feed.name}: ${items.length} items found`);
        return items.slice(0, limit);
      } catch (error: any) {
        console.error(`[RSS] Error fetching ${feed.name}:`, error.message);
        errors.push(`${feed.name}: ${error.message}`);
        return [];
      }
    });
    
    const feedResults = await Promise.all(feedPromises);
    feedResults.forEach(items => allItems.push(...items));
    
    console.log(`[RSS] Total items fetched: ${allItems.length}`);
    
    // Save to database if requested
    let savedCount = 0;
    let skippedCount = 0;
    
    if (saveToDb && allItems.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      for (const item of allItems) {
        try {
          // Parse published date
          let publishedAt: string | null = null;
          if (item.publishedAt) {
            try {
              publishedAt = new Date(item.publishedAt).toISOString();
            } catch {
              publishedAt = null;
            }
          }
          
          // Upsert to avoid duplicates (based on unique link)
          const { error } = await supabase
            .from('rss_items')
            .upsert({
              user_id: userId,
              source_name: item.sourceName,
              source_url: item.sourceUrl,
              title: item.title,
              description: item.description,
              link: item.link,
              image_url: item.imageUrl,
              has_image: !!item.imageUrl,
              published_at: publishedAt,
              fetched_at: new Date().toISOString(),
            }, {
              onConflict: 'link',
              ignoreDuplicates: true,
            });
          
          if (error) {
            if (error.code === '23505') { // Duplicate key
              skippedCount++;
            } else {
              console.error('[RSS] Insert error:', error);
            }
          } else {
            savedCount++;
          }
        } catch (dbError: any) {
          console.error('[RSS] DB error for item:', dbError.message);
        }
      }
      
      console.log(`[RSS] Saved: ${savedCount}, Skipped (duplicates): ${skippedCount}`);
    }
    
    // Group items by source for response
    const groupedItems: Record<string, RssItem[]> = {};
    allItems.forEach(item => {
      if (!groupedItems[item.sourceName]) {
        groupedItems[item.sourceName] = [];
      }
      groupedItems[item.sourceName].push(item);
    });
    
    // Stats
    const stats = {
      totalItems: allItems.length,
      withImages: allItems.filter(i => i.imageUrl).length,
      withoutImages: allItems.filter(i => !i.imageUrl).length,
      savedToDb: savedCount,
      skippedDuplicates: skippedCount,
      sources: Object.keys(groupedItems).length,
      errors: errors.length,
    };
    
    return new Response(
      JSON.stringify({
        success: true,
        stats,
        items: allItems,
        grouped: groupedItems,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('[RSS] Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
