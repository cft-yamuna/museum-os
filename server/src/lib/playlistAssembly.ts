import type { Knex } from 'knex';
import { buildContentUrl } from './contentFiles.js';

export interface AssembledPlaylistItem {
  id: string;
  contentId: string;
  content: { name: string; type: string };
  position: number;
  duration: number;
  transition: string;
  url: string;
  config: Record<string, unknown> | null;
}

export interface AssembledPlaylist {
  id: string;
  name: string;
  loop: boolean;
  items: AssembledPlaylistItem[];
}

/**
 * Load a playlist and its ordered items, each with a resolved content URL.
 * Returns null if the playlist does not exist. Mirrors the assembly used by
 * GET /api/playlists/:id so callers (e.g. fallback content) get identical shapes.
 */
export async function assemblePlaylist(
  db: Knex,
  playlistId: string
): Promise<AssembledPlaylist | null> {
  const playlist = await db('playlists').where({ id: playlistId }).first();
  if (!playlist) return null;

  const rawItems = await db('playlist_items')
    .join('content', 'playlist_items.content_id', 'content.id')
    .join('content_versions', function () {
      this.on('content_versions.content_id', '=', 'content.id').andOn(
        'content_versions.version_number',
        '=',
        'content.current_version'
      );
    })
    .select(
      'playlist_items.id',
      'playlist_items.content_id',
      'content.name as content_name',
      'content.type as content_type',
      'playlist_items.position',
      'playlist_items.duration_sec',
      'playlist_items.transition',
      'playlist_items.config',
      'content.current_version',
      'content_versions.file_path'
    )
    .where('playlist_items.playlist_id', playlistId)
    .orderBy('playlist_items.position', 'asc');

  const items: AssembledPlaylistItem[] = rawItems.map(
    (item: {
      id: string;
      content_id: string;
      content_name: string;
      content_type: string;
      position: number;
      duration_sec: number;
      transition: string;
      config: Record<string, unknown> | null;
      current_version: number;
      file_path: string;
    }) => ({
      id: item.id,
      contentId: item.content_id,
      content: { name: item.content_name, type: item.content_type },
      position: item.position,
      duration: item.duration_sec,
      transition: item.transition,
      url: buildContentUrl(
        playlist.site_id,
        item.content_type,
        item.content_id,
        item.current_version,
        item.file_path
      ),
      config: item.config,
    })
  );

  return { id: playlist.id, name: playlist.name, loop: !!playlist.loop, items };
}
