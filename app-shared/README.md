# app-shared – code both BQuee apps use

A local Flutter package (`bquee_shared`) used by **BQuee Biz** (`mobile/`) and the **BQuee** customer app (`customer/`), so shared code exists once.

| Folder         | What                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/core/`    | Server connection (`api.dart`), JSON reading, formatting (money, dates, token numbers), the phone's own features (`native.dart`), QR drawing and reading (`qr/`) |
| `lib/ui/`      | Theme, icon set, and the shared widgets (buttons, cards, forms, lists, pagination…)                                                                              |
| `lib/screens/` | Screens both apps show (account delete / deactivate request)                                                                                                     |

Apps import it as `package:bquee_shared/...` and set the server once at start-up: `serverApi = session.api;`.
The apps find it at `../app-shared`, so keep it next to the app folders.
