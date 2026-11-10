import type { ReactNode } from 'react';
import { Icon } from './icons';

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; tall?: boolean; actions?: ReactNode }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className={'sheet' + (props.tall ? ' tall' : '')} role="dialog" aria-label={props.title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{props.title}</h2>
          {props.actions}
          <button className="icon-btn" onClick={props.onClose} aria-label="סגירה">{Icon.close}</button>
        </div>
        <div className="sheet-body">{props.children}</div>
      </div>
    </>
  );
}

export function Segmented<T extends string | number>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {props.options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === props.value} className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider(props: { id: string; label: string; value: number; min: number; max: number; step?: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={props.id}>
        {props.label}
        <output>{props.format ? props.format(props.value) : props.value}</output>
      </label>
      <input id={props.id} className="range" type="range" min={props.min} max={props.max} step={props.step ?? 0.01} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </div>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="toggle" role="switch" aria-checked={props.value} onClick={() => props.onChange(!props.value)}>
      <span>{props.label}</span>
      <span className={'switch' + (props.value ? ' on' : '')} />
    </button>
  );
}

const DEFAULT_SWATCHES = ['#FFFFFF', '#111111', '#FFD60A', '#FFB547', '#FF5DA2', '#FF3B30', '#3DF2A0', '#4CC9F0', '#7C5CFF', '#D4AF37'];

export function ColorPicker(props: { label: string; value: string; onChange: (v: string) => void; extra?: string[] }) {
  const list = [...new Set([...(props.extra ?? []), ...DEFAULT_SWATCHES])];
  return (
    <div className="field">
      <span className="field-label">{props.label}</span>
      <div className="swatches">
        {list.map((c) => (
          <button key={c} className={'swatch' + (c.toLowerCase() === props.value.toLowerCase() ? ' on' : '')} style={{ background: c }} aria-label={c} onClick={() => props.onChange(c)} />
        ))}
        <label className="swatch picker" aria-label="צבע אחר">
          <input type="color" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
        </label>
      </div>
    </div>
  );
}

export function Check(props: { on: boolean }) {
  return <span className={'check' + (props.on ? ' on' : '')}>{props.on ? Icon.check : null}</span>;
}

export function Progress(props: { value?: number }) {
  const ind = props.value == null;
  return (
    <div className={'progress' + (ind ? ' indeterminate' : '')} role="progressbar" aria-valuenow={ind ? undefined : Math.round((props.value ?? 0) * 100)}>
      <div style={{ width: `${Math.round((props.value ?? 0) * 100)}%` }} />
    </div>
  );
}
