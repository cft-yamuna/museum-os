import type { Knex } from 'knex';
import crypto from 'node:crypto';

export async function seed(knex: Knex): Promise<void> {
  // ── Lookup site created by 001_default_data ──────────────────────────
  const site = await knex('sites').where('code', 'hilight-museum').first();
  if (!site) {
    console.log('Museum OS site not found — run 001_default_data first. Skipping.');
    return;
  }
  const siteId: string = site.id;

  // ── Idempotency: skip if devices already exist for this site ─────────
  const existingDevice = await knex('devices').where('site_id', siteId).first();
  if (existingDevice) {
    console.log('Devices already exist for this site, skipping 002_demo_apps seed.');
    return;
  }

  // ── Lookup ground floor (created by 001) ─────────────────────────────
  const groundFloor = await knex('floors')
    .where({ site_id: siteId, level: 0 })
    .first();
  if (!groundFloor) {
    console.log('Ground Floor not found — run 001_default_data first. Skipping.');
    return;
  }

  // ====================================================================
  // FLOOR
  // ====================================================================
  const [firstFloor] = await knex('floors')
    .insert({
      site_id: siteId,
      name: 'First Floor',
      level: 1,
      width: 1920,
      height: 1080,
      config: {},
    })
    .returning('*');
  console.log('Created floor: First Floor');

  // ====================================================================
  // CONTENT  (7 items) + CONTENT VERSIONS
  // ====================================================================
  const contentDefs = [
    { name: 'Intro Video',       type: 'video', file: 'intro-video.mp4',       size: 788493,  mime: 'video/mp4' },
    { name: 'Lobby Entrance',    type: 'image', file: 'lobby-entrance.jpg',    size: 210235,  mime: 'image/jpeg' },
    { name: 'Exhibit Hall',      type: 'image', file: 'exhibit-hall.jpg',      size: 344086,  mime: 'image/jpeg' },
    { name: 'Sculpture Gallery', type: 'image', file: 'sculpture-gallery.jpg', size: 391645,  mime: 'image/jpeg' },
    { name: 'Modern Art',        type: 'image', file: 'modern-art.jpg',        size: 72515,   mime: 'image/jpeg' },
    { name: 'Heritage Wing',     type: 'image', file: 'heritage-wing.jpg',     size: 394281,  mime: 'image/jpeg' },
    { name: 'Floor Map',         type: 'image', file: 'floor-map.jpg',         size: 366127,  mime: 'image/jpeg' },
  ] as const;

  const contentIds: Record<string, string> = {};

  for (const def of contentDefs) {
    const [content] = await knex('content')
      .insert({
        site_id: siteId,
        name: def.name,
        type: def.type,
        current_version: 1,
        is_active: true,
      })
      .returning('*');

    await knex('content_versions').insert({
      content_id: content.id,
      version_number: 1,
      file_path: `/demo-media/${def.file}`,
      file_size: def.size,
      hash: '',
      metadata: JSON.stringify({
        originalName: def.file,
        mimeType: def.mime,
      }),
    });

    contentIds[def.name] = content.id;
  }
  console.log(`Created ${contentDefs.length} content items with versions`);

  // ====================================================================
  // PLAYLIST  —  Heritage Gallery Slideshow
  // ====================================================================
  const [playlist] = await knex('playlists')
    .insert({
      site_id: siteId,
      name: 'Heritage Gallery Slideshow',
      description: 'Curated slideshow for the Heritage Gallery wing',
      loop: true,
      is_active: true,
    })
    .returning('*');

  const playlistItems = [
    { content_id: contentIds['Lobby Entrance'],    duration_sec: 5,  transition: 'fade' },
    { content_id: contentIds['Exhibit Hall'],       duration_sec: 8,  transition: 'fade' },
    { content_id: contentIds['Sculpture Gallery'],  duration_sec: 10, transition: 'slide-left' },
    { content_id: contentIds['Modern Art'],         duration_sec: 8,  transition: 'dissolve' },
    { content_id: contentIds['Heritage Wing'],      duration_sec: 10, transition: 'fade' },
  ];

  for (let i = 0; i < playlistItems.length; i++) {
    await knex('playlist_items').insert({
      playlist_id: playlist.id,
      content_id: playlistItems[i].content_id,
      position: i,
      duration_sec: playlistItems[i].duration_sec,
      transition: playlistItems[i].transition,
    });
  }
  console.log('Created playlist: Heritage Gallery Slideshow with', playlistItems.length, 'items');

  // ====================================================================
  // APPS  (5)
  // ====================================================================

  // 1. Lobby Video Loop
  const [lobbyVideoLoopApp] = await knex('apps')
    .insert({
      site_id: siteId,
      name: 'Lobby Video Loop',
      template_type: 'app04-media-loop',
      config: JSON.stringify({
        videoUrl: '/demo-media/intro-video.mp4',
        muted: true,
        volume: 0,
        fit: 'cover',
        backgroundColor: '#000000',
        idle: {
          type: 'image',
          url: '/demo-media/lobby-entrance.jpg',
          transitionDuration: 1000,
        },
      }),
      is_active: true,
    })
    .returning('*');
  console.log('Created app:', lobbyVideoLoopApp.name);

  // 2. Heritage Gallery Slideshow
  const [heritageSlideshowApp] = await knex('apps')
    .insert({
      site_id: siteId,
      name: 'Heritage Gallery Slideshow',
      template_type: 'app03-touch-carousel',
      config: JSON.stringify({
        playlistId: playlist.id,
        defaultDuration: 8,
        transition: 'fade',
        transitionDuration: 800,
        fit: 'cover',
        backgroundColor: '#000000',
        shuffle: false,
        loop: true,
      }),
      is_active: true,
    })
    .returning('*');
  console.log('Created app:', heritageSlideshowApp.name);

  // 3. Floor Navigation Map
  const [navMapApp] = await knex('apps')
    .insert({
      site_id: siteId,
      name: 'Floor Navigation Map',
      template_type: 'app05-interactive-map',
      config: JSON.stringify({
        mapImageUrl: '/demo-media/floor-map.jpg',
        hotspots: [
          { id: 'hs-1', label: 'Heritage Wing', description: 'Historical artifacts and documents', x: 20, y: 30, width: 15, height: 10 },
          { id: 'hs-2', label: 'Modern Art', description: 'Contemporary art installations', x: 60, y: 25, width: 15, height: 10 },
          { id: 'hs-3', label: 'Sculpture Gallery', description: 'Sculpture collection', x: 40, y: 60, width: 15, height: 10 },
          { id: 'hs-4', label: 'Lobby', description: 'Main entrance and information', x: 50, y: 85, width: 20, height: 10 },
        ],
        idle: {
          type: 'image',
          url: '/demo-media/floor-map.jpg',
          transitionDuration: 1000,
        },
        inactivityTimeout: 60000,
      }),
      is_active: true,
    })
    .returning('*');
  console.log('Created app:', navMapApp.name);

  // 4. Modern Art Explorer
  const [modernArtExplorerApp] = await knex('apps')
    .insert({
      site_id: siteId,
      name: 'Modern Art Explorer',
      template_type: 'app06-media-browser',
      config: JSON.stringify({
        items: [
          { id: 'item-1', title: 'Exhibit Hall',       url: '/demo-media/exhibit-hall.jpg',      type: 'image' },
          { id: 'item-2', title: 'Sculpture Gallery',  url: '/demo-media/sculpture-gallery.jpg', type: 'image' },
          { id: 'item-3', title: 'Modern Art',         url: '/demo-media/modern-art.jpg',        type: 'image' },
          { id: 'item-4', title: 'Heritage Wing',      url: '/demo-media/heritage-wing.jpg',     type: 'image' },
          { id: 'item-5', title: 'Lobby Entrance',     url: '/demo-media/lobby-entrance.jpg',    type: 'image' },
        ],
        backgroundColor: '#1a1a2e',
      }),
      is_active: true,
    })
    .returning('*');
  console.log('Created app:', modernArtExplorerApp.name);

  // 5. Welcome Audio
  const [welcomeAudioApp] = await knex('apps')
    .insert({
      site_id: siteId,
      name: 'Welcome Audio',
      template_type: 'app01-monophone-audio-multi',
      config: JSON.stringify({
        controllerId: 'audio-guide-esp32',
        buttons: [
          { buttonId: 1, label: 'Welcome Message',    audioUrl: '/demo-media/intro-video.mp4' },
          { buttonId: 2, label: 'Heritage Wing Tour', audioUrl: '/demo-media/intro-video.mp4' },
          { buttonId: 3, label: 'Gallery Guide',      audioUrl: '/demo-media/intro-video.mp4' },
        ],
        idle: {
          type: 'image',
          url: '/demo-media/lobby-entrance.jpg',
          transitionDuration: 1000,
        },
      }),
      is_active: true,
    })
    .returning('*');
  console.log('Created app:', welcomeAudioApp.name);

  // ====================================================================
  // DEVICES  (6)
  // ====================================================================
  function toSlug(displayName: string): string {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const deviceDefs = [
    {
      display_name: 'Lobby Welcome Screen',
      hostname: 'lobby-welcome',
      type: 'display',
      floor_id: groundFloor.id,
      app_id: lobbyVideoLoopApp.id,
      mac_address: '02:00:00:00:01:01',
    },
    {
      display_name: 'Heritage Gallery Panel',
      hostname: 'heritage-panel',
      type: 'display',
      floor_id: firstFloor.id,
      app_id: heritageSlideshowApp.id,
      mac_address: '02:00:00:00:01:02',
    },
    {
      display_name: 'Modern Art Kiosk',
      hostname: 'modern-art-kiosk',
      type: 'kiosk',
      floor_id: firstFloor.id,
      app_id: modernArtExplorerApp.id,
      mac_address: '02:00:00:00:01:03',
    },
    {
      display_name: 'Sculpture Projector',
      hostname: 'sculpture-projector',
      type: 'projector',
      floor_id: firstFloor.id,
      app_id: null,
      mac_address: '02:00:00:00:01:04',
    },
    {
      display_name: 'Audio Guide Station',
      hostname: 'audio-guide',
      type: 'kiosk',
      floor_id: groundFloor.id,
      app_id: welcomeAudioApp.id,
      mac_address: '02:00:00:00:01:05',
    },
    {
      display_name: 'Entrance Digital Sign',
      hostname: 'entrance-sign',
      type: 'display',
      floor_id: groundFloor.id,
      app_id: null,
      mac_address: '02:00:00:00:01:06',
    },
  ];

  const devices: Record<string, any> = {};

  for (const def of deviceDefs) {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const [device] = await knex('devices')
      .insert({
        site_id: siteId,
        floor_id: def.floor_id,
        mac_address: def.mac_address,
        hostname: def.hostname,
        display_name: def.display_name,
        type: def.type,
        capabilities: JSON.stringify({}),
        ip_address: '0.0.0.0',
        status: 'offline',
        x_position: 0,
        y_position: 0,
        config: JSON.stringify({ apiKey }),
        app_id: def.app_id,
        slug: toSlug(def.display_name),
      })
      .returning('*');

    devices[def.display_name] = device;
  }
  console.log(`Created ${deviceDefs.length} devices`);

  // ====================================================================
  // DEVICE GROUPS  (2) + MEMBERS
  // ====================================================================

  // 1. Lobby Screens
  const [lobbyGroup] = await knex('device_groups')
    .insert({
      site_id: siteId,
      name: 'Lobby Screens',
      type: 'zone',
      description: 'All displays in the lobby area',
      color: '#3B82F6',
      config: JSON.stringify({}),
    })
    .returning('*');

  await knex('device_group_members').insert([
    { group_id: lobbyGroup.id, device_id: devices['Lobby Welcome Screen'].id },
    { group_id: lobbyGroup.id, device_id: devices['Entrance Digital Sign'].id },
  ]);
  console.log('Created device group: Lobby Screens (2 members)');

  // 2. Gallery Displays
  const [galleryGroup] = await knex('device_groups')
    .insert({
      site_id: siteId,
      name: 'Gallery Displays',
      type: 'zone',
      description: 'Displays across gallery wings',
      color: '#8B5CF6',
      config: JSON.stringify({}),
    })
    .returning('*');

  await knex('device_group_members').insert([
    { group_id: galleryGroup.id, device_id: devices['Heritage Gallery Panel'].id },
    { group_id: galleryGroup.id, device_id: devices['Modern Art Kiosk'].id },
    { group_id: galleryGroup.id, device_id: devices['Sculpture Projector'].id },
  ]);
  console.log('Created device group: Gallery Displays (3 members)');

  // ====================================================================
  // EXHIBITION + ASSIGNMENTS
  // ====================================================================
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 90);

  const [exhibition] = await knex('exhibitions')
    .insert({
      site_id: siteId,
      name: 'Museum OS Heritage Exhibition',
      description: 'Museum OS demo exhibition for heritage content and interactive displays',
      start_date: today.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      is_active: true,
    })
    .returning('*');

  // Assignment 1: Heritage Gallery Panel -> playlist
  await knex('exhibition_assignments').insert({
    exhibition_id: exhibition.id,
    device_id: devices['Heritage Gallery Panel'].id,
    playlist_id: playlist.id,
    config: JSON.stringify({}),
  });

  // Assignment 2: Modern Art Kiosk -> content
  await knex('exhibition_assignments').insert({
    exhibition_id: exhibition.id,
    device_id: devices['Modern Art Kiosk'].id,
    content_id: contentIds['Modern Art'],
    config: JSON.stringify({}),
  });
  console.log('Created exhibition: Museum OS Heritage Exhibition with 2 assignments');

  // ====================================================================
  // SCHEDULES  (2)
  // ====================================================================

  // 1. Weekday Power On
  await knex('schedules').insert({
    site_id: siteId,
    name: 'Weekday Power On',
    type: 'power',
    target_type: 'group',
    target_ids: knex.raw('?::uuid[]', ['{' + lobbyGroup.id + '}']),
    action: 'power_on',
    cron_expression: '0 9 * * 1-5',
    payload: JSON.stringify({}),
    is_enabled: true,
  });

  // 2. Weekday Power Off
  await knex('schedules').insert({
    site_id: siteId,
    name: 'Weekday Power Off',
    type: 'power',
    target_type: 'group',
    target_ids: knex.raw('?::uuid[]', ['{' + lobbyGroup.id + '}']),
    action: 'power_off',
    cron_expression: '0 18 * * 1-5',
    payload: JSON.stringify({}),
    is_enabled: true,
  });
  console.log('Created 2 schedules: Weekday Power On/Off');

  // ====================================================================
  console.log('Demo seed 002_demo_apps complete.');
}
