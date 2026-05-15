import axios from 'axios';
import { DEFAULT_HEADERS } from './constants';

export interface SubtitleTrack {
  file: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

export interface ExtractedStream {
  m3u8: string;
  referer: string;
  tracks: SubtitleTrack[];
}

export async function extractMegaplay(embedUrl: string): Promise<ExtractedStream | null> {
  try {
    const host = new URL(embedUrl).host;
    const referer = 'https://' + host + '/';
    
    const { data: html } = await axios.get(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer }
    });
    
    const match = html.match(/<title>File ([0-9]+)/);
    if (!match) return null;
    
    const id = match[1];
    const { data } = await axios.get(`https://${host}/stream/getSources?id=${id}`, {
      headers: { ...DEFAULT_HEADERS, 'X-Requested-With': 'XMLHttpRequest', Referer: referer }
    });
    
    const m3u8 = data?.sources?.file;
    const tracks = data?.tracks || [];
    return m3u8 ? { m3u8, referer, tracks } : null;
  } catch (err) {
    console.error('Megaplay extraction failed:', err);
    return null;
  }
}

export async function extractMegacloud(embedUrl: string): Promise<ExtractedStream | null> {
  try {
    const origin = new URL(embedUrl).origin;
    const referer = origin + '/';
    
    const { data: html } = await axios.get(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer }
    });
    
    const match1 = html.match(/\b[a-zA-Z0-9]{48}\b/);
    const match2 = html.match(/\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b/);
    const nonce = match1?.[0] || (match2 ? match2[1] + match2[2] + match2[3] : null);
    
    if (!nonce) return null;
    
    const sId = embedUrl.split('/e-1/')[1]?.split('?')[0] ?? embedUrl.split('/').pop()?.split('?')[0];
    const url = `${origin}/embed-2/v3/e-1/getSources?id=${sId}&_k=${nonce}`;
    
    const { data } = await axios.get(url, {
      headers: { ...DEFAULT_HEADERS, 'Accept': '*/*', 'X-Requested-With': 'XMLHttpRequest', Referer: referer }
    });
    
    const tracks = data?.tracks || [];
    
    if (!data.encrypted || (data.sources && data.sources[0]?.file.includes('.m3u8'))) {
      return data.sources[0]?.file ? { m3u8: data.sources[0].file, referer, tracks } : null;
    }
    
    const { data: keys } = await axios.get('https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json');
    const secret = keys['mega'];
    
    const decryptUrl = `https://megacloud-api-nine.vercel.app/?encrypted_data=${encodeURIComponent(data.sources[0].file)}&nonce=${encodeURIComponent(nonce)}&secret=${encodeURIComponent(secret)}`;
    const { data: decrypted } = await axios.get(decryptUrl);
    
    const m3u8 = (typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted)).match(/"file":"(.*?)"/)?.[1];
    return m3u8 ? { m3u8, referer, tracks } : null;
  } catch (err) {
    console.error('Megacloud extraction failed:', err);
    return null;
  }
}

export async function extractStreamUrl(embedUrl: string): Promise<ExtractedStream | null> {
  const host = new URL(embedUrl).hostname;
  
  if (host.includes('megaplay.buzz') || host.includes('vidwish.live')) {
    return extractMegaplay(embedUrl);
  } else if (host.includes('megacloud.blog')) {
    return extractMegacloud(embedUrl);
  }
  
  return null;
}
