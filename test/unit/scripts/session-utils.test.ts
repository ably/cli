import { expect } from 'chai';
import { computeCredentialHash } from '../../../scripts/session-utils.js';

describe('session-utils: computeCredentialHash', function () {
  it('produces a deterministic SHA-256 hash', function () {
    const h1 = computeCredentialHash('key123', 'tokenABC');
    const h2 = computeCredentialHash('key123', 'tokenABC');
    expect(h1).to.equal(h2);
    expect(h1).to.match(/^[a-f0-9]{64}$/);
  });

  it('differs when credentials differ', function () {
    const h1 = computeCredentialHash('key123', 'tokenABC');
    const h2 = computeCredentialHash('key123', 'different');
    expect(h1).to.not.equal(h2);
  });

  it('handles missing values safely', function () {
    const h1 = computeCredentialHash('onlyKey', '');
    const h2 = computeCredentialHash('onlyKey', '');
    expect(h1).to.equal(h2);
  });
}); 