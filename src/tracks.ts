export type TrackDefinition = {
  id: string;
  title: string;
  fileName: string;
};

export type Track = TrackDefinition & {
  source: string;
};

export const TRACK_DEFINITIONS: readonly TrackDefinition[] = [
  { id: 'track-01', title: 'Quiet Motion', fileName: '01_Quiet_Motion_v2_96BPM.mp3' },
  { id: 'track-02', title: 'Music Box Stroll', fileName: '02_Music_Box_Stroll_v4_MusicBox005_84BPM.mp3' },
  { id: 'track-03', title: 'Moonlit Waterside Room', fileName: '03_Moonlit_Waterside_Room_v6_77BPM.mp3' },
  { id: 'track-04', title: 'Variant A Six Eight Nocturne', fileName: '04_Variant_A_SixEight_Nocturne_72BPM.mp3' },
  { id: 'track-05', title: 'Variant D Night Waltz', fileName: '05_Variant_D_Night_Waltz_90BPM.mp3' },
  { id: 'track-06', title: 'Still Lake Morning', fileName: '06_Still_Lake_Morning.mp3' },
  { id: 'track-07', title: 'Coffee by the Window', fileName: '07_Coffee_by_the_Window.mp3' },
  { id: 'track-08', title: 'Blanket and Blue Sky', fileName: '08_Blanket_and_Blue_Sky.mp3' },
  { id: 'track-09', title: 'Quiet Ripples', fileName: '09_Quiet_Ripples.mp3' },
  { id: 'track-10', title: 'Slow Sunday Light', fileName: '10_Slow_Sunday_Light.mp3' },
  { id: 'track-11', title: 'Pillow-side Daydream', fileName: '11_Pillow-side_Daydream.mp3' },
  { id: 'track-12', title: 'Cedar Cabin Coffee', fileName: '12_Cedar_Cabin_Coffee.mp3' },
  { id: 'track-13', title: 'Clouds Over the Lake', fileName: '13_Clouds_Over_the_Lake.mp3' },
  { id: 'track-14', title: 'Afternoon Stillness', fileName: '14_Afternoon_Stillness.mp3' },
  { id: 'track-15', title: 'Dusk in Soft Blue', fileName: '15_Dusk_in_Soft_Blue.mp3' },
  { id: 'track-16', title: 'Sunlit Stone Avenue', fileName: '16_Sunlit_Stone_Avenue_90BPM.mp3' },
  { id: 'track-17', title: 'Arcane Bell Tower', fileName: '17_Arcane_Bell_Tower_84BPM.mp3' },
  { id: 'track-18', title: 'Willowmere Harbor', fileName: '18_Willowmere_Harbor_86BPM.mp3' },
  { id: 'track-19', title: 'Lanterns of the Old Market', fileName: '19_Lanterns_of_the_Old_Market_94BPM.mp3' },
  { id: 'track-20', title: 'Emerald Chapel Garden', fileName: '20_Emerald_Chapel_Garden_76BPM.mp3' },
  { id: 'track-21', title: 'Moonwell Academy', fileName: '21_Moonwell_Academy_82BPM.mp3' },
  { id: 'track-22', title: 'Rivergate Morning', fileName: '22_Rivergate_Morning_92BPM.mp3' },
  { id: 'track-23', title: 'Mistwood Village', fileName: '23_Mistwood_Village_78BPM.mp3' },
  { id: 'track-24', title: 'Starlit Alchemist Quarter', fileName: '24_Starlit_Alchemist_Quarter_88BPM.mp3' },
  { id: 'track-25', title: 'Golden Fountain Plaza', fileName: '25_Golden_Fountain_Plaza_96BPM.mp3' },
  { id: 'track-26', title: 'Whispering Library', fileName: '26_Whispering_Library_72BPM.mp3' },
  { id: 'track-27', title: 'Rosebridge Festival', fileName: '27_Rosebridge_Festival_102BPM.mp3' },
  { id: 'track-28', title: 'Silverleaf Outskirts', fileName: '28_Silverleaf_Outskirts_80BPM.mp3' },
  { id: 'track-29', title: 'Twilight Clockwork Lane', fileName: '29_Twilight_Clockwork_Lane_91BPM.mp3' },
  { id: 'track-30', title: 'Homeward Through the Gates', fileName: '30_Homeward_Through_the_Gates_86BPM.mp3' },
  { id: 'track-31', title: 'Moonlit Shrine Reverie', fileName: '31_Moonlit_Shrine_Reverie.mp3' },
  { id: 'track-32', title: 'Bamboo Flute Moon', fileName: '32_Bamboo_Flute_Moon.mp3' },
  { id: 'track-33', title: 'Lantern Path Under the Full Moon', fileName: '33_Lantern_Path_Under_the_Full_Moon.mp3' },
  { id: 'track-34', title: 'Moon on Temple Water', fileName: '34_Moon_on_Temple_Water.mp3' },
  { id: 'track-35', title: 'Midnight Torii Shamisen', fileName: '35_Midnight_Torii_Shamisen.mp3' },
  { id: 'track-36', title: 'Glowing Bamboo Sanctuary', fileName: '36_Glowing_Bamboo_Sanctuary.mp3' },
  { id: 'track-37', title: 'Stone Steps at Moonrise', fileName: '37_Stone_Steps_at_Moonrise.mp3' },
  { id: 'track-38', title: 'Silver Pagoda Dream', fileName: '38_Silver_Pagoda_Dream.mp3' },
  { id: 'track-39', title: 'Bamboo Corridor Groove', fileName: '39_Bamboo_Corridor_Groove.mp3' },
  { id: 'track-40', title: 'Fox Shrine Nocturne', fileName: '40_Fox_Shrine_Nocturne.mp3' },
  { id: 'track-41', title: 'Starlit Shrine Courtyard', fileName: '41_Starlit_Shrine_Courtyard.mp3' },
  { id: 'track-42', title: 'Misty Bamboo Moon', fileName: '42_Misty_Bamboo_Moon.mp3' },
  { id: 'track-43', title: 'Afterglow of the Festival', fileName: '43_Afterglow_of_the_Festival.mp3' },
  { id: 'track-44', title: 'Blue Moon Forest Shrine', fileName: '44_Blue_Moon_Forest_Shrine.mp3' },
  { id: 'track-45', title: 'Dawn Beyond Bamboo', fileName: '45_Dawn_Beyond_Bamboo.mp3' },
];

export function createTracks(audioBaseUrl: string): Track[] {
  return TRACK_DEFINITIONS.map((track) => ({
    ...track,
    source: `${audioBaseUrl}${track.fileName}`,
  }));
}
