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
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private final Object playerLock = new Object();
    private MediaPlayer activePlayer = null;
    private boolean bridgeAttached = false;

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
            // Allow seamless HTMLAudioElement playback after async TTS fetches without gesture expiry
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
        public void fetchTikTokMp3Async(final String text, final String voice, final String callbackId) {
            final String safeId = sanitizeId(callbackId);
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL("https://tiktok-tts.weilnet.workers.dev/api/generation");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(9000);
                    conn.setReadTimeout(10000);
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
