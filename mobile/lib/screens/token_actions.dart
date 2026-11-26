// Start / Finish on a token, shared by the owner's Tokens, the staff queue and the token screen.
// The business chooses in Settings: each service on its own (a button per service, sent with its
// index) or the whole token at once (one button; the server starts or finishes all of the person's
// services on the token).

import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'common.dart';

/// Sends start / finish / next for token [id] – one service when [index] is given. True when it worked.
Future<bool> tokenAct(BuildContext context, String id, String action, {int? index}) async {
  final r = await runAction(
    context,
    () => session.api.post('/api/token/$id/$action', index == null ? <String, dynamic>{} : {'index': index}),
  );
  return r != null;
}
