package com.sinotalk.app;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String BING_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

    private final Object playerLock = new Object();
    private final Object bingTokenLock = new Object();
    private MediaPlayer activePlayer = null;
    private boolean bridgeAttached = false;

    // Cached Bing Translator public session tokens (refreshed every 8 minutes or on auth error)
    private String cachedBingIg = null;
    private String cachedBingKey = null;
    private String cachedBingToken = null;
    private String cachedBingCookies = "";
    private long cachedBingAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureAudioWebView();
    }

    @Override
    public void onStart() {
        super.onStart();
        configureAudioWebView();
    }

    private void configureAudioWebView() {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            if (!bridgeAttached) {
                webView.addJavascriptInterface(new SinoNativeAudioBridge(webView), "SinoNativeAudio");
                bridgeAttached = true;
            }
        }
    }

    private void releaseActivePlayer() {
        synchronized (playerLock) {
            if (activePlayer != null) {
                try {
                    if (activePlayer.isPlaying()) {
                        activePlayer.stop();
                    }
                } catch (Exception ignored) {
                }
                try {
                    activePlayer.reset();
                    activePlayer.release();
                } catch (Exception ignored) {
                }
                activePlayer = null;
            }
        }
    }

    @Override
    public void onDestroy() {
        releaseActivePlayer();
        super.onDestroy();
    }

    private boolean ensureBingTokens(boolean forceRefresh) {
        synchronized (bingTokenLock) {
            long now = System.currentTimeMillis();
            if (!forceRefresh && cachedBingIg != null && cachedBingKey != null && cachedBingToken != null
                && (now - cachedBingAt) < 480_000L) {
                return true;
            }
            HttpURLConnection conn = null;
            try {
                URL url = new URL("https://www.bing.com/translator");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(9000);
                conn.setReadTimeout(10000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", BING_UA);
                conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9");

                if (conn.getResponseCode() != 200) {
                    return false;
                }

                StringBuilder cookieBuilder = new StringBuilder();
                Map<String, List<String>> headers = conn.getHeaderFields();
                if (headers != null) {
                    for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                        if (entry.getKey() != null && entry.getKey().equalsIgnoreCase("Set-Cookie") && entry.getValue() != null) {
                            for (String rawCookie : entry.getValue()) {
                                String pair = rawCookie.split(";")[0].trim();
                                if (!pair.isEmpty()) {
                                    if (cookieBuilder.length() > 0) cookieBuilder.append("; ");
                                    cookieBuilder.append(pair);
                                }
                            }
                        }
                    }
                }

                StringBuilder html = new StringBuilder();
                try (InputStream is = conn.getInputStream();
                     BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        html.append(line).append('\n');
                    }
                }

                String body = html.toString();
                Matcher igM = Pattern.compile("IG:\"([A-F0-9]+)\"").matcher(body);
                Matcher pm = Pattern.compile("params_AbusePreventionHelper\\s*=\\s*\\[(\\d+),\"([^\"]+)\",(\\d+)\\]").matcher(body);

                if (igM.find() && pm.find()) {
                    cachedBingIg = igM.group(1);
                    cachedBingKey = pm.group(1);
                    cachedBingToken = pm.group(2);
                    cachedBingCookies = cookieBuilder.toString();
                    cachedBingAt = System.currentTimeMillis();
                    return true;
                }
                return false;
            } catch (Exception e) {
                return false;
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
    }

    private String escapeXml(String input) {
        if (input == null) return "";
        return input
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&apos;");
    }

    private String fetchBingAudioBase64(String text, String lang, String voice) {
        for (int attempt = 0; attempt < 2; attempt++) {
            boolean force = (attempt == 1);
            if (!ensureBingTokens(force)) {
                continue;
            }
            String ig;
            String key;
            String token;
            String cookies;
            synchronized (bingTokenLock) {
                ig = cachedBingIg;
                key = cachedBingKey;
                token = cachedBingToken;
                cookies = cachedBingCookies;
            }
            HttpURLConnection conn = null;
            try {
                String endpoint = "https://www.bing.com/tfettts?isVertical=1&&IG=" + ig + "&IID=translator.5028";
                URL url = new URL(endpoint);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(9000);
                conn.setReadTimeout(14000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                conn.setRequestProperty("User-Agent", BING_UA);
                conn.setRequestProperty("Referer", "https://www.bing.com/translator");
                if (cookies != null && !cookies.isEmpty()) {
                    conn.setRequestProperty("Cookie", cookies);
                }

                String ssml =
                    "<speak version='1.0' xml:lang='" + escapeXml(lang) + "'>" +
                    "<voice xml:lang='" + escapeXml(lang) + "' xml:gender='Male' name='" + escapeXml(voice) + "'>" +
                    "<prosody rate='0%'>" + escapeXml(text) + "</prosody>" +
                    "</voice></speak>";

                String formBody =
                    "ssml=" + URLEncoder.encode(ssml, "UTF-8") +
                    "&token=" + URLEncoder.encode(token, "UTF-8") +
                    "&key=" + URLEncoder.encode(key, "UTF-8");

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(formBody.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }

                int status = conn.getResponseCode();
                String ct = conn.getContentType();
                if (status != 200 || ct == null || !ct.toLowerCase().contains("audio")) {
                    continue;
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                try (InputStream is = conn.getInputStream()) {
                    int n;
                    while ((n = is.read(buf)) != -1) {
                        baos.write(buf, 0, n);
                    }
                }
                byte[] audioBytes = baos.toByteArray();
                if (audioBytes.length > 500) {
                    return Base64.encodeToString(audioBytes, Base64.NO_WRAP);
                }
            } catch (Exception ignored) {
                // retry once with fresh token
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        return "";
    }

    private class SinoNativeAudioBridge {
        private final WebView webView;

        SinoNativeAudioBridge(WebView webView) {
            this.webView = webView;
        }

        private String sanitizeId(String raw) {
            if (raw == null) return "";
            return raw.replaceAll("[^a-zA-Z0-9_-]", "");
        }

        private void emitPlaybackDone(final String safeId, final boolean ok) {
            webView.post(() -> webView.evaluateJavascript(
                "window.__sinoNativeAudioDone && window.__sinoNativeAudioDone('" + safeId + "', " + ok + ");",
                null
            ));
        }

        private void emitFetchDone(final String safeId, final String safeBase64) {
            webView.post(() -> webView.evaluateJavascript(
                "window.__sinoNativeFetchDone && window.__sinoNativeFetchDone('" + safeId + "', '" + safeBase64 + "');",
                null
            ));
        }

        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public void stop() {
            releaseActivePlayer();
        }

        @JavascriptInterface
        public void playBase64Mp3(final String base64Audio, final float rate, final String callbackId) {
            final String safeId = sanitizeId(callbackId);
            new Thread(() -> {
                try {
                    byte[] audioBytes = Base64.decode(base64Audio, Base64.DEFAULT);
                    if (audioBytes == null || audioBytes.length < 128) {
                        emitPlaybackDone(safeId, false);
                        return;
                    }

                    File tempFile = new File(getCacheDir(), "sino_tts_" + safeId + ".mp3");
                    try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                        fos.write(audioBytes);
                        fos.flush();
                    }

                    releaseActivePlayer();

                    final MediaPlayer mp = new MediaPlayer();
                    mp.setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    );
                    mp.setDataSource(tempFile.getAbsolutePath());
                    mp.setOnCompletionListener(player -> {
                        try {
                            tempFile.delete();
                        } catch (Exception ignored) {
                        }
                        synchronized (playerLock) {
                            if (activePlayer == player) {
                                activePlayer = null;
                            }
                        }
                        try {
                            player.release();
                        } catch (Exception ignored) {
                        }
                        emitPlaybackDone(safeId, true);
                    });
                    mp.setOnErrorListener((player, what, extra) -> {
                        try {
                            tempFile.delete();
                        } catch (Exception ignored) {
                        }
                        synchronized (playerLock) {
                            if (activePlayer == player) {
                                activePlayer = null;
                            }
                        }
                        try {
                            player.release();
                        } catch (Exception ignored) {
                        }
                        emitPlaybackDone(safeId, false);
                        return true;
                    });

                    mp.prepare();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        try {
                            float clampedRate = Math.max(0.65f, Math.min(1.6f, rate));
                            PlaybackParams params = mp.getPlaybackParams();
                            params.setSpeed(clampedRate);
                            mp.setPlaybackParams(params);
                        } catch (Exception ignored) {
                        }
                    }

                    synchronized (playerLock) {
                        activePlayer = mp;
                    }
                    mp.start();
                } catch (Exception e) {
                    emitPlaybackDone(safeId, false);
                }
            }).start();
        }

        @JavascriptInterface
        public void fetchBingMaleMp3Async(final String text, final String lang, final String voice, final String callbackId) {
            final String safeId = sanitizeId(callbackId);
            new Thread(() -> {
                String b64 = fetchBingAudioBase64(text, lang, voice);
                String safeB64 = b64 == null ? "" : b64.replaceAll("[^A-Za-z0-9+/=]", "");
                emitFetchDone(safeId, safeB64);
            }).start();
        }

        @JavascriptInterface
        public void fetchTikTokMp3Async(final String text, final String voice, final String callbackId) {
            final String safeId = sanitizeId(callbackId);
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL("https://tiktok-tts.weilnet.workers.dev/api/generation");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(9000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setRequestProperty("Accept", "application/json");

                    JSONObject payload = new JSONObject();
                    payload.put("text", text);
                    payload.put("voice", voice);
                    byte[] bodyBytes = payload.toString().getBytes(StandardCharsets.UTF_8);

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(bodyBytes);
                        os.flush();
                    }

                    int status = conn.getResponseCode();
                    if (status != 200) {
                        emitFetchDone(safeId, "");
                        return;
                    }

                    StringBuilder sb = new StringBuilder();
                    try (InputStream is = conn.getInputStream();
                         BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = br.readLine()) != null) {
                            sb.append(line);
                        }
                    }

                    JSONObject json = new JSONObject(sb.toString());
                    if (json.optBoolean("success", false)) {
                        String data = json.optString("data", "");
                        String safeB64 = data.replaceAll("[^A-Za-z0-9+/=]", "");
                        emitFetchDone(safeId, safeB64);
                    } else {
                        emitFetchDone(safeId, "");
                    }
                } catch (Exception e) {
                    emitFetchDone(safeId, "");
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }).start();
        }
    }
}
