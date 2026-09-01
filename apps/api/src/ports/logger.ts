export type HttpLogRecord={event:'http_request';requestId:string;method:string;route:string;status:number;durationMs:number}
export type StructuredLogger={info(record:HttpLogRecord):void;error(record:HttpLogRecord):void}

export const jsonConsoleLogger:StructuredLogger={
  info(record){console.info(JSON.stringify(record))},
  error(record){console.error(JSON.stringify(record))},
}
