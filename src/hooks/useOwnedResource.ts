import { useEffect } from 'react';

/** Release resources this component creates; never pass loader-cache geometry here. */
export function useOwnedResource(resource: { dispose: () => void }): void {
  useEffect(() => () => resource.dispose(), [resource]);
}
