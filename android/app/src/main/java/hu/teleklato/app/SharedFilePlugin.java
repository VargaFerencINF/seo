package hu.teleklato.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Más alkalmazásból megosztott (ACTION_SEND) vagy megnyitott (ACTION_VIEW) GeoJSON / KML / DXF fájl
 * átadása a webes rétegnek. A tartalmat szövegként adja át (max. 20 MB).
 */
@CapacitorPlugin(name = "SharedFile")
public class SharedFilePlugin extends Plugin {

    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private JSObject pending;

    @Override
    public void load() {
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (handleIntent(intent)) {
            notifyListeners("sharedFile", pending, true);
        }
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject result = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(result);
    }

    @SuppressWarnings("deprecation")
    private boolean handleIntent(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(action)) {
            if (Build.VERSION.SDK_INT >= 33) {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            }
        } else if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        }
        if (uri == null) return false;
        JSObject obj = new JSObject();
        obj.put("name", displayName(uri));
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("A fájl nem olvasható.");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            int total = 0;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > MAX_BYTES) throw new IllegalStateException("A fájl túl nagy (20 MB felett).");
                out.write(buf, 0, n);
            }
            obj.put("text", new String(out.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            obj.put("error", e.getMessage() != null ? e.getMessage() : e.toString());
        }
        pending = obj;
        // ne dolgozzuk fel újra (pl. képernyő-elforgatásnál)
        intent.setAction(null);
        return true;
    }

    private String displayName(Uri uri) {
        String name = null;
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {
            // nem minden szolgáltató ad nevet
        }
        if (name == null) name = uri.getLastPathSegment();
        return name != null ? name : "megosztott-fajl";
    }
}
