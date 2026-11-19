/* Asks to confirm, then deletes through the API and reloads – used by the owner's Branches and Services. */

import { api } from '../../core/api.js';
import { confirmAction, toast } from '../../core/ui.jsx';
import { handleError } from '../Shell.jsx';

export async function confirmDelete({ title, message, url, done, reload }) {
  if (!(await confirmAction({ title, message, confirm: 'Delete' }))) return;
  try {
    await api('DELETE', url);
    toast(done);
    reload();
  } catch (err) {
    handleError(err);
  }
}
