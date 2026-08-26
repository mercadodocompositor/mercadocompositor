export const getRequestCode = (requestId: string) =>
  requestId.split('-')[0].toUpperCase();
