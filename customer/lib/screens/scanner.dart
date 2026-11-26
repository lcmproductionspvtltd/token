// Full-screen scanner for a business's BQuee QR code. Android: camera frames are decoded by our own Dart QR decoder
// (in a background isolate). iOS: the system's built-in QR detector. No plugins.

import 'dart:async';
import 'dart:io';

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/core/qr/qr_decode.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

String? _decodeFrame(Map<String, dynamic> f) {
  return decodeQrLuminance(f['y'] as Uint8List, f['w'] as int, f['h'] as int, fast: true);
}

/// Opens the scanner; returns the business QR code that was scanned, or null if closed.
Future<({String kind, String id})?> scanBusiness(BuildContext context, {String title = 'Scan business QR'}) {
  return Navigator.of(context).push<({String kind, String id})>(
    MaterialPageRoute(fullscreenDialog: true, builder: (_) => ScannerPage(title: title)),
  );
}

class ScannerPage extends StatefulWidget {
  final String title;
  const ScannerPage({super.key, this.title = 'Scan business QR'});

  @override
  State<ScannerPage> createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage> with WidgetsBindingObserver {
  int? textureId;
  double previewW = 1280, previewH = 720;
  int rotation = 0;
  String error = '';
  String hint = 'Point the camera at the business’s BQuee QR code';
  bool torch = false;
  bool done = false;
  bool decoding = false;
  StreamSubscription<dynamic>? sub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // The preview maths assumes portrait; keep the scanner upright while it's open.
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    _start();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _stop();
    } else if (state == AppLifecycleState.resumed && textureId == null && !done) {
      _start();
    }
  }

  Future<void> _start() async {
    try {
      final r = await Native.startCamera();
      if (!mounted) return;
      setState(() {
        textureId = (r['textureId'] as num?)?.toInt();
        previewW = ((r['width'] as num?) ?? 1280).toDouble();
        previewH = ((r['height'] as num?) ?? 720).toDouble();
        rotation = ((r['rotation'] as num?) ?? 0).toInt();
        error = '';
      });
      sub ??= Native.cameraEvents.receiveBroadcastStream().listen(_onEvent, onError: (_) {});
    } on PlatformException catch (e) {
      if (!mounted) return;
      setState(
        () => error = e.code == 'denied'
            ? 'Camera access is off. Allow it in your phone’s Settings, or paste the business link below.'
            : 'The camera could not start. You can paste the business link below.',
      );
    } catch (_) {
      if (mounted) setState(() => error = 'The camera could not start. You can paste the business link below.');
    }
  }

  Future<void> _stop() async {
    await sub?.cancel();
    sub = null;
    await Native.stopCamera();
    if (mounted) setState(() => textureId = null);
  }

  Future<void> _onEvent(dynamic event) async {
    if (done || event is! Map) return;
    final type = event['type'];
    if (type == 'code') {
      _handle((event['text'] ?? '').toString());
      return;
    }
    if (type == 'frame' && !decoding) {
      decoding = true;
      try {
        final text = await compute(_decodeFrame, <String, dynamic>{
          'y': event['y'] as Uint8List,
          'w': (event['w'] as num).toInt(),
          'h': (event['h'] as num).toInt(),
        });
        if (text != null) _handle(text);
      } catch (_) {
        // ignore a bad frame
      } finally {
        decoding = false;
        if (!done) Native.frameDone();
      }
    }
  }

  void _handle(String text) {
    if (done) return;
    final place = placeFromCode(text);
    if (place == null) {
      setState(
        () => hint = tokenIdFromCode(text) != null
            ? 'That’s a token QR. Scan the business’s QR code to book a token.'
            : 'This isn’t a BQuee business QR code.',
      );
      HapticFeedback.heavyImpact();
      return;
    }
    done = true;
    HapticFeedback.mediumImpact();
    SystemSound.play(SystemSoundType.click);
    _stop();
    Navigator.of(context).pop(place);
  }

  Future<void> _manual() async {
    final ctrl = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tk.rLg)),
        title: const Text(
          'Business link',
          style: TextStyle(fontFamily: Tk.serif, fontWeight: FontWeight.w600),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Paste the business’s BQuee link, for example …/b/ab12cd or …/s/lotus-salon.',
              style: TextStyle(color: Tk.ink2),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(hintText: 'https://…/b/…'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Open')),
        ],
      ),
    );
    if (text == null || text.isEmpty || !mounted) return;
    final place = placeFromCode(text.contains('/') ? text : '/s/${text.toLowerCase()}');
    if (place == null) {
      toast(context, 'That isn’t a BQuee business link', error: true);
      return;
    }
    done = true;
    await _stop();
    if (mounted) Navigator.of(context).pop(place);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    sub?.cancel();
    Native.stopCamera();
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    Widget preview;
    if (textureId == null) {
      preview = Container(color: Colors.black);
    } else {
      final quarter = Platform.isAndroid ? (rotation ~/ 90) % 4 : 0;
      final w = quarter.isOdd ? previewH : previewW;
      final h = quarter.isOdd ? previewW : previewH;
      preview = FittedBox(
        fit: BoxFit.cover,
        clipBehavior: Clip.hardEdge,
        child: SizedBox(
          width: w,
          height: h,
          child: RotatedBox(
            quarterTurns: quarter,
            child: SizedBox(
              width: previewW,
              height: previewH,
              child: Texture(textureId: textureId!),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          preview,
          // dim everything outside the scan window
          LayoutBuilder(
            builder: (context, c) {
              final side = (c.maxWidth < c.maxHeight ? c.maxWidth : c.maxHeight) * 0.68;
              return CustomPaint(size: Size(c.maxWidth, c.maxHeight), painter: _FramePainter(side, b.c));
            },
          ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const AppIcon('x', color: Colors.white, size: 24),
                        tooltip: 'Close',
                      ),
                      Expanded(
                        child: Text(
                          widget.title,
                          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
                        ),
                      ),
                      if (textureId != null)
                        IconButton(
                          tooltip: torch ? 'Torch off' : 'Torch on',
                          onPressed: () async {
                            final ok = await Native.setTorch(!torch);
                            if (ok && mounted) setState(() => torch = !torch);
                          },
                          icon: AppIcon('bolt', color: torch ? const Color(0xFFFFD34D) : Colors.white, size: 24),
                        ),
                    ],
                  ),
                ),
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(color: fade(Colors.black, 0.55), borderRadius: BorderRadius.circular(16)),
                    child: Text(
                      error.isNotEmpty ? error : hint,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, height: 1.4),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
                  child: Btn(
                    'Paste a business link instead',
                    icon: 'link',
                    kind: BtnKind.white,
                    expand: true,
                    onPressed: _manual,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FramePainter extends CustomPainter {
  final double side;
  final Color color;
  _FramePainter(this.side, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromCenter(center: Offset(size.width / 2, size.height / 2 - 30), width: side, height: side);
    final rr = RRect.fromRectAndRadius(rect, const Radius.circular(28));
    final outer = Path()..addRect(Offset.zero & size);
    final hole = Path()..addRRect(rr);
    canvas.drawPath(Path.combine(PathOperation.difference, outer, hole), Paint()..color = fade(Colors.black, 0.45));
    final p = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    const l = 34.0;
    final r = rect;
    for (final c in [
      [r.topLeft, const Offset(1, 0), const Offset(0, 1)],
      [r.topRight, const Offset(-1, 0), const Offset(0, 1)],
      [r.bottomLeft, const Offset(1, 0), const Offset(0, -1)],
      [r.bottomRight, const Offset(-1, 0), const Offset(0, -1)],
    ]) {
      final o = c[0];
      canvas.drawLine(o + c[1] * 8, o + c[1] * l, p);
      canvas.drawLine(o + c[2] * 8, o + c[2] * l, p);
    }
    canvas.drawRRect(
      rr,
      Paint()
        ..color = fade(color, 0.6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
  }

  @override
  bool shouldRepaint(covariant _FramePainter old) => old.side != side;
}
