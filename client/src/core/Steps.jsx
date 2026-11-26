/*
 * Long forms shown one short step at a time.
 *   <StepBar steps={['Business', 'Owner']} at={0} onPick={setAt} canPick={(i) => i < at} />
 *   <StepFormDialog title="New business" steps={[{ title: 'Business', body: <…/> }, …]} submit="Create" onSubmit={…} onClose={…} />
 * Only the current step's fields are on the page, so the browser checks just those
 * (required, minLength, type=email…) before moving on.
 */

import { useRef, useState } from 'react';
import { Button, Dialog, Icon, toast } from './ui.jsx';

/** Numbered steps with names; finished steps get a tick and can be tapped to go back. */
export function StepBar({ steps, at, onPick, canPick = (i) => i < at }) {
  return (
    <ol className="form-steps" aria-label="Steps">
      {steps.map((name, i) => {
        const state = i === at ? 'on' : i < at ? 'done' : '';
        const open = i !== at && canPick(i);
        return (
          <li key={name} className={state} aria-current={i === at ? 'step' : undefined}>
            <button
              type="button"
              disabled={!open}
              onClick={() => onPick(i)}
              aria-label={'Step ' + (i + 1) + ': ' + name}
            >
              <span className="num">{i < at ? <Icon name="check" /> : i + 1}</span>
              <em>{name}</em>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Dialog form in steps. New items go step by step (Next checks the current step);
 * when editing (`free`), any step can be opened and Save works from every step.
 */
export function StepFormDialog({ title, steps, submit = 'Save', onSubmit, onClose, width, free = false }) {
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const form = useRef(null);
  const formId = useRef('f' + Math.random().toString(36).slice(2)).current;
  const last = at === steps.length - 1;

  const go = (i) => {
    setAt(i);
    const body = form.current && form.current.closest('.dialog-body');
    if (body) body.scrollTop = 0;
  };
  const next = () => {
    if (form.current && !form.current.reportValidity()) return;
    go(at + 1);
  };
  const handle = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!last && !free) return next();
    setBusy(true);
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      toast(err.message, 'err');
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={width}
      className="step-dialog"
      footer={
        <>
          {at > 0 ? (
            <Button variant="quiet" icon="back" onClick={() => go(at - 1)}>
              Back
            </Button>
          ) : (
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
          )}
          {!last && (
            <Button variant={free ? 'quiet' : 'primary'} iconRight="arrow" onClick={next}>
              Next
            </Button>
          )}
          {(last || free) && (
            <button type="submit" form={formId} className="btn primary" disabled={busy}>
              <span>{busy ? 'Saving…' : submit}</span>
            </button>
          )}
        </>
      }
    >
      <StepBar steps={steps.map((s) => s.title)} at={at} onPick={go} canPick={(i) => free || i < at} />
      <form id={formId} ref={form} onSubmit={handle} className="form-stack">
        {steps[at].body}
      </form>
    </Dialog>
  );
}
