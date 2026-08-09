# Screen 4: Documents

**Route:** `/documents` (list), `/documents/[id]` (detail)
**Step:** N/A

## Prerequisites

- User is authenticated
- Documents filtered by userId and active organizationId

## Components (List View: `/documents`)

### Page Header

- **Selector:** `getByRole('heading', { name: /documents/i })`
- **Visible when:** always
- **Expected:** displays "Documents" title and "Create and manage your documents" description

### New Document Button

- **Selector:** `getByRole('button', { name: /new document/i })`
- **Visible when:** always
- **Disabled when:** document is being created
- **States:**
  - **Default:** icon + "New Document"
  - **Creating:** "Creating..."
- **Action -- click:**
  1. POST form action `?/create`
  2. Creates document with sample content
  3. Redirects to `/documents/{id}`
- **Expected:** creates new document and navigates to editor

### Empty State

- **Selector:** `locator('[data-testid="empty-state"]')` or `getByText(/no documents yet/i)`
- **Visible when:** no documents exist
- **Hidden when:** documents exist
- **Expected:** shows FileText icon, "No documents yet", "Create your first document" message, and a New Document button

### Document Card Grid

- **Selector:** `locator('.grid')`
- **Visible when:** documents exist
- **Expected:** responsive grid (1 col sm, 2 col md, 3 col lg)

### Document Card

- **Selector:** `locator('[class*="card"]')` per document
- **Visible when:** documents exist
- **Components per card:**
  - **Title:** document title (line-clamped to 1 line)
  - **Updated date:** "Updated {date}" in card description
  - **Edit button:** ghost icon button with EditIcon
  - **Delete button:** ghost icon button with TrashIcon
  - **Preview text:** plainText content (line-clamped to 3 lines, if exists)
- **Action -- click card:** navigates to `/documents/{id}`
- **Action -- click delete:** browser confirm dialog, then submits hidden delete form
- **Expected:** displays document info with CRUD actions

## Components (Detail View: `/documents/[id]`)

### DocumentEditor

- **Selector:** full-height editor component
- **Visible when:** document loaded
- **Props:**
  - Back button linking to `/documents`
  - Delete button (redirects to `/documents`)
  - Full-height layout
- **Actions:**
  - POST `?/update`: saves title + content
  - POST `?/delete`: removes document
  - POST `?/transformText`: text transformation
  - POST `?/aiTransform`: AI-powered content transformation
- **Expected:** full Milkdown markdown editor with toolbar, save, delete, and AI features

## Verification Steps (MCP)

1. Navigate to `/documents` (must be authenticated)
2. Take snapshot -- confirm heading and "New Document" button visible
3. If no documents: confirm empty state is shown
4. Click "New Document" -- confirm redirect to `/documents/{id}`
5. Take snapshot on document detail -- confirm editor is loaded
6. Navigate back to `/documents` -- confirm document appears in grid
7. Confirm document card shows title, updated date, edit and delete buttons

## Observed Behavior

<!-- Filled in by the agent after MCP verification. One entry per verification run. -->
