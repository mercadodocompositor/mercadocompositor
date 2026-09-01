type MonitoringLevel = 'error' | 'warning' | 'info';

interface MonitoringEvent {
  level: MonitoringLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  path: string;
  release: string;
}

const endpoint = import.meta.env.VITE_OBSERVABILITY_ENDPOINT?.trim();
const release = import.meta.env.VITE_APP_RELEASE?.trim() || 'development';
const sensitiveKey = /(email|cpf|cnpj|phone|whatsapp|password|token|authorization|document|signature)/i;

export const sanitizeMonitoringValue = (value: unknown, depth=0): unknown => {
  if(depth>3) return '[truncated]';
  if(typeof value==='string') return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]')
    .replace(/\b\d{11,14}\b/g,'[document]')
    .slice(0,500);
  if(value instanceof Error) return {name:value.name,message:sanitizeMonitoringValue(value.message),stack:value.stack?.split('\n').slice(0,8).join('\n')};
  if(Array.isArray(value)) return value.slice(0,20).map(item=>sanitizeMonitoringValue(item,depth+1));
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value as Record<string,unknown>).slice(0,30).map(([key,item])=>[key,sensitiveKey.test(key)?'[redacted]':sanitizeMonitoringValue(item,depth+1)]));
  return value;
};

const send = (event: MonitoringEvent) => {
  if(!endpoint) return;
  const body=JSON.stringify(sanitizeMonitoringValue(event));
  if(navigator.sendBeacon) { navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'})); return; }
  void fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>undefined);
};

export const captureException = (error: unknown, context?: Record<string,unknown>) => send({
  level:'error',message:error instanceof Error?error.message:'Erro inesperado',context:{error,...context},timestamp:new Date().toISOString(),path:location.pathname,release
});

export const captureEvent = (message:string,level:MonitoringLevel='info',context?:Record<string,unknown>) => send({level,message,context,timestamp:new Date().toISOString(),path:location.pathname,release});

export const initializeMonitoring = () => {
  window.addEventListener('error',event=>captureException(event.error||event.message,{source:'window.error'}));
  window.addEventListener('unhandledrejection',event=>captureException(event.reason,{source:'unhandledrejection'}));
  if(!endpoint||!('PerformanceObserver' in window)) return;
  try {
    const observer=new PerformanceObserver(list=>list.getEntries().forEach(entry=>{
      if(entry.entryType==='largest-contentful-paint'||entry.entryType==='layout-shift') captureEvent('web-vital','info',{type:entry.entryType,value:'value' in entry?Number((entry as PerformanceEntry & {value?:number}).value||0):entry.startTime});
    }));
    observer.observe({type:'largest-contentful-paint',buffered:true});
    observer.observe({type:'layout-shift',buffered:true});
  } catch { /* Navegador sem suporte completo a métricas de desempenho. */ }
};
