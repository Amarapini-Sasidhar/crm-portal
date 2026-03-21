import { useEffect, useState } from 'react';

const ROBOTS_TXT_URL = 'https://crm-api-n7c7.onrender.com/robots.txt';

export function RobotsTxtPage() {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRobotsTxt() {
      try {
        setLoading(true);
        setError(false);

        const response = await fetch(ROBOTS_TXT_URL);
        if (!response.ok) {
          throw new Error('Failed to load robots.txt');
        }

        const text = await response.text();
        if (!active) {
          return;
        }

        setContent(text);
      } catch {
        if (!active) {
          return;
        }

        setError(true);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadRobotsTxt();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <pre style={plainTextStyle}>Loading...</pre>;
  }

  if (error) {
    return <pre style={plainTextStyle}>Failed to load robots.txt</pre>;
  }

  return <pre style={plainTextStyle}>{content}</pre>;
}

const plainTextStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  minHeight: '100vh',
  background: '#ffffff',
  color: '#000000',
  fontFamily: 'monospace',
  fontSize: '14px',
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap'
};
