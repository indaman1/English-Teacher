import { useEffect } from 'react';

/** Sets the document title and meta description for the current page (SEO + accessibility). */
export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = title === 'AI English Teacher' ? title : `${title} · AI English Teacher`;
    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = description;
    }
  }, [title, description]);
}
