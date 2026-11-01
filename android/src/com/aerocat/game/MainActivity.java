package com.aerocat.game;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Full-screen WebView host for the AERO.CAT game (assets/index.html). */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(251, 250, 243));
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(this), "AeroNative");

        setContentView(web);
        hideSystemUi();
        web.loadUrl("file:///android_asset/index.html");
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            web.evaluateJavascript("window.__onPause && window.__onPause()", null);
            web.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.evaluateJavascript("window.__onResume && window.__onResume()", null);
        }
        hideSystemUi();
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.__onBack && window.__onBack()) ? '1' : '0'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || value.indexOf('1') < 0) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("AeroNative");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Tiny JS bridge: persistent saves (SharedPreferences) and haptics. */
    static class Bridge {
        private final SharedPreferences prefs;
        private final Vibrator vibrator;

        Bridge(Context c) {
            prefs = c.getSharedPreferences("aerocat", Context.MODE_PRIVATE);
            vibrator = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
        }

        @JavascriptInterface
        public String load(String key) {
            return prefs.getString(key, "");
        }

        @JavascriptInterface
        public void save(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(int ms) {
            try {
                if (vibrator != null && vibrator.hasVibrator()) vibrator.vibrate(Math.max(1, Math.min(ms, 400)));
            } catch (Exception ignored) {
                // haptics are optional
            }
        }
    }
}
