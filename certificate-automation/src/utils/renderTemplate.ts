/**
 * Tiny {{variable}} substitution - intentionally not a full template engine
 * (Handlebars/Mustache) to keep dependencies minimal for something this
 * simple. Unmatched {{placeholders}} are left as-is so a missing variable is
 * obvious in the output rather than silently blank.
 */
export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : match;
  });
}
