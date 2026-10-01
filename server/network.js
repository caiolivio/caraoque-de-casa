import { networkInterfaces } from 'node:os';

const VIRTUAL = /vethernet|virtualbox|vmware|docker|wsl|hyper-v|loopback|tailscale|zerotier|utun|br-|veth/i;

// Escolhe o IP do PC na rede de casa, para montar o endereço do QR code.
export function getLanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      let score = 0;
      if (a.address.startsWith('192.168.')) score += 3;
      else if (a.address.startsWith('10.')) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 1;
      if (VIRTUAL.test(name)) score -= 10;
      candidates.push({ address: a.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? 'localhost';
}
