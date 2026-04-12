import { ScrollViewStyleReset } from 'expo-router/html'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/* Hide everything until React hydrates and fonts are loaded */}
        <style dangerouslySetInnerHTML={{ __html: `
          html, body {
            background-color: #f5f5f7;
            margin: 0;
            padding: 0;
            height: 100%;
          }
          body {
            overflow: hidden;
          }
          #root {
            opacity: 0;
            height: 100%;
          }
          #root.app-ready {
            opacity: 1;
            transition: opacity 0.15s ease-in;
          }
          body.app-ready {
            overflow: auto;
          }
        `}} />
        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
