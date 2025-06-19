import { expect } from 'chai';
import { getCliVersion } from '../../../src/utils/version.js';
import packageJson from '../../../package.json' with { type: 'json' };

describe('version utility', function() {
  describe('getCliVersion', function() {
    it('should return a valid semantic version string', function() {
      const version = getCliVersion();
      expect(version).to.be.a('string');
      // Should match semantic versioning format (e.g., 1.2.3, 1.2.3-beta.1, etc.)
      expect(version).to.match(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    });

    it('should return the same version from package.json', function() {
      const version = getCliVersion();
      expect(version).to.equal(packageJson.version);
    });

    it('should return consistent version on multiple calls', function() {
      const version1 = getCliVersion();
      const version2 = getCliVersion();
      const version3 = getCliVersion();
      
      expect(version1).to.equal(version2);
      expect(version2).to.equal(version3);
    });

    it('should return a non-empty version', function() {
      const version = getCliVersion();
      expect(version).to.have.length.greaterThan(0);
    });
  });
});