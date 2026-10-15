
/** Capture only the paid mail transport; native admission and confirmation stay real. */
export function captureMail() {
  const messages: {to:string[];text:string}[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== 'https://api.resend.com/emails') return previous(input, init);
    messages.push(await request.json() as {to:string[];text:string});
    return Response.json({id:crypto.randomUUID()});
  };
  return {
    latestLink(email: string) {
      const message = messages.findLast(item => item.to.includes(email));
      const link = message?.text.match(/https?:\/\/\S+/)?.[0];
      if (!link) throw Error('No mail reached the provider edge');
      return new URL(link);
    },
    restore: () => { globalThis.fetch = previous; },
  };
}
