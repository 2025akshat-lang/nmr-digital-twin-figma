import React, { useEffect, useRef } from 'react';
import { useNMR } from '../NMRContext';
import type { AlarmLevel } from '../types';

const levelColor = (l: AlarmLevel) => ({
  INFO: '#5a8ab0',
  WARNING: '#ffab00',
  ERROR: '#ff1744',
  CRITICAL: '#ff1744',
}[l] ?? '#5a8ab0');

const levelIcon = (l: AlarmLevel) => ({ INFO: 'ℹ', WARNING: '⚠', ERROR: '✗', CRITICAL: '✕' }[l] ?? 'ℹ');

export default function EventLog({ compact = false }: { compact?: boolean }) {
  const { state, dispatch } = useNMR();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0; // newest at top
    }
  }, [state.eventLog.length]);

  if (compact) {
    // Compact side-panel version
    return (
      <div className="flex flex-col h-full" style={{ background: '#050d1a', borderTop: '1px solid #1a3a5c' }}>
        <div className="flex items-center justify-between px-2 py-1 flex-shrink-0" style={{ borderBottom: '1px solid #0d1e38', background: '#071525' }}>
          <span className="font-mono text-[9px] text-[#3a6a8f] tracking-widest">EVENT LOG</span>
          <button className="font-mono text-[8px] text-[#3a6a8f] hover:text-[#00d4ff] px-1"
            onClick={() => dispatch({ type: 'CLEAR_EVENTS' })}>CLR</button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-0.5" style={{ maxHeight: '150px' }}>
          {state.eventLog.length === 0 ? (
            <span className="font-mono text-[9px] text-[#1a3a5c]">No events</span>
          ) : (
            state.eventLog.map(e => (
              <div key={e.id} className="flex items-start gap-1 mb-0.5">
                <span className="font-mono text-[8px] flex-shrink-0" style={{ color: '#3a6a8f' }}>{e.time}</span>
                <span className="font-mono text-[8px] flex-shrink-0" style={{ color: levelColor(e.level) }}>{levelIcon(e.level)}</span>
                <span className="font-mono text-[8px] leading-tight" style={{ color: levelColor(e.level), opacity: 0.85 }}>{e.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#050d1a' }}>
      <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a5c', background: '#071525' }}>
        <span className="font-mono text-[10px] font-bold tracking-widest text-[#00d4ff]">EVENT LOG</span>
        <div className="flex gap-2">
          <span className="font-mono text-[9px] text-[#3a6a8f]">{state.eventLog.length} entries</span>
          <button className="nmr-btn text-[9px] px-2 py-0.5" onClick={() => dispatch({ type: 'CLEAR_EVENTS' })}>CLEAR</button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {state.eventLog.length === 0 ? (
          <p className="font-mono text-[10px] text-[#1a3a5c]">No events recorded.</p>
        ) : (
          state.eventLog.map(e => (
            <div key={e.id} className="flex items-start gap-2 py-0.5" style={{ borderBottom: '1px solid #071525' }}>
              <span className="font-mono text-[9px] text-[#3a6a8f] flex-shrink-0 mt-0.5">{e.time}</span>
              <span className="flex-shrink-0 mt-0.5" style={{ color: levelColor(e.level) }}>{levelIcon(e.level)}</span>
              <span className="font-mono text-[10px]" style={{ color: levelColor(e.level) }}>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Notification popup component
export function NotificationToast() {
  const { state, dispatch } = useNMR();
  const notif = state.notification;

  useEffect(() => {
    if (!notif?.visible) return;
    // Auto-dismiss info notifications after 4s, others after 6s
    const timeout = notif.level === 'INFO' ? 4000 : 6000;
    const id = setTimeout(() => dispatch({ type: 'HIDE_NOTIFICATION' }), timeout);
    return () => clearTimeout(id);
  }, [notif, dispatch]);

  if (!notif?.visible) return null;

  const classes = {
    INFO: 'nmr-notif-info',
    WARNING: 'nmr-notif-warning',
    ERROR: 'nmr-notif-error',
    CRITICAL: 'nmr-notif-error',
  }[notif.level] ?? 'nmr-notif-info';

  const successLevels = ['INFO'];
  const cls = notif.level === 'INFO' && (notif.title.includes('COMPLETE') || notif.title.includes('READY') || notif.title.includes('ACQUIRED'))
    ? 'nmr-notif-success'
    : classes;

  return (
    <div className={`nmr-notification ${cls} cursor-pointer fade-in`} onClick={() => dispatch({ type: 'HIDE_NOTIFICATION' })}>
      <div className="font-bold text-[12px] mb-1">{notif.title}</div>
      <div className="text-[10px] opacity-80">{notif.message}</div>
    </div>
  );
}
