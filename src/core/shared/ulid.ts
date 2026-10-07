const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encode(value: number, length: number): string {
  let encoded = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    encoded = ENCODING[remaining % 32] + encoded;
    remaining = Math.floor(remaining / 32);
  }
  return encoded;
}

export function createUlid(now = Date.now()): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return `${encode(now, 10)}${[...random].map((byte) => ENCODING[byte % 32]).join("")}`;
}
