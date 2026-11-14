/* Ringside — boxer dataset.
 *
 * Records are professional records (W-L-D, KOs) as best known as of mid-2026; legends use their
 * final career records. Height / reach are in cm. `lbs` is the typical fight-night weight for
 * heavyweights (other divisions derive it from the division limit plus rehydration).
 *
 * Ratings (0-100) are hand-calibrated from CompuBox-style output/accuracy numbers, KO ratios,
 * stoppage history and the consensus scouting view of each fighter at their PRIME:
 *   pow  power        spd  hand speed     acc  accuracy      def  defence
 *   chin chin         sta  stamina        foot footwork      iq   ring IQ
 *   work output       heart  recovery / will
 *
 * Edit freely - everything else reads from this file.
 */
(function (root) {
  const BX = (root.BX = root.BX || {});

  BX.DIVISIONS = [
    { key: 'HW',   name: 'Heavyweight',          short: 'HW',   lb: null },
    { key: 'CW',   name: 'Cruiserweight',        short: 'CRW',  lb: 200 },
    { key: 'LHW',  name: 'Light Heavyweight',    short: 'LHW',  lb: 175 },
    { key: 'SMW',  name: 'Super Middleweight',   short: 'SMW',  lb: 168 },
    { key: 'MW',   name: 'Middleweight',         short: 'MW',   lb: 160 },
    { key: 'SWW',  name: 'Super Welterweight',   short: 'SWW',  lb: 154 },
    { key: 'WW',   name: 'Welterweight',         short: 'WW',   lb: 147 },
    { key: 'SLW',  name: 'Super Lightweight',    short: 'SLW',  lb: 140 },
    { key: 'LW',   name: 'Lightweight',          short: 'LW',   lb: 135 },
    { key: 'SFW',  name: 'Super Featherweight',  short: 'SFW',  lb: 130 },
    { key: 'FW',   name: 'Featherweight',        short: 'FW',   lb: 126 },
    { key: 'SBW',  name: 'Super Bantamweight',   short: 'SBW',  lb: 122 },
    { key: 'BW',   name: 'Bantamweight',         short: 'BW',   lb: 118 },
    { key: 'SFLW', name: 'Super Flyweight',      short: 'SFLW', lb: 115 },
    { key: 'FLW',  name: 'Flyweight',            short: 'FLW',  lb: 112 },
    { key: 'LFW',  name: 'Light Flyweight',      short: 'LFW',  lb: 108 },
    { key: 'MIN',  name: 'Minimumweight',        short: 'MIN',  lb: 105 },
  ];

  BX.STYLES = {
    boxer:          'Out-boxer',
    'boxer-puncher':'Boxer-puncher',
    counter:        'Counter-puncher',
    slugger:        'Slugger',
    swarmer:        'Pressure fighter',
  };

  const KEYS = ['pow', 'spd', 'acc', 'def', 'chin', 'sta', 'foot', 'iq', 'work', 'heart'];

  // id, name, nickname, country, division, stance (O/S), style, record "W-L-D-KO", height, reach, era, lbs|null, ratings
  const rows = [
    // ── Heavyweight ──────────────────────────────────────────────
    ['usyk', 'Oleksandr Usyk', 'The Cat', 'UKR', 'HW', 'S', 'boxer', '24-0-0-15', 191, 198, '2020s', 225, [78, 88, 90, 90, 88, 95, 95, 97, 86, 96]],
    ['fury', 'Tyson Fury', 'The Gypsy King', 'GBR', 'HW', 'O', 'boxer', '34-2-1-24', 206, 216, '2020s', 262, [82, 80, 82, 85, 90, 85, 88, 92, 72, 97]],
    ['joshua', 'Anthony Joshua', 'AJ', 'GBR', 'HW', 'O', 'boxer-puncher', '29-4-0-26', 198, 208, '2020s', 245, [92, 80, 82, 74, 72, 74, 74, 80, 72, 82]],
    ['dubois', 'Daniel Dubois', 'Dynamite', 'GBR', 'HW', 'O', 'slugger', '22-3-0-21', 196, 198, '2020s', 245, [91, 74, 78, 68, 74, 76, 70, 72, 74, 80]],
    ['wilder', 'Deontay Wilder', 'The Bronze Bomber', 'USA', 'HW', 'O', 'slugger', '44-4-1-43', 201, 211, '2010s', 215, [99, 82, 64, 64, 72, 72, 72, 66, 60, 90]],
    ['parker', 'Joseph Parker', '', 'NZL', 'HW', 'O', 'boxer-puncher', '36-3-0-24', 193, 193, '2020s', 255, [82, 80, 80, 78, 86, 82, 76, 82, 76, 86]],
    ['zhang', 'Zhilei Zhang', 'Big Bang', 'CHN', 'HW', 'S', 'slugger', '27-3-1-22', 198, 201, '2020s', 280, [92, 66, 78, 62, 84, 66, 58, 76, 58, 82]],
    ['kabayel', 'Agit Kabayel', '', 'GER', 'HW', 'O', 'swarmer', '26-0-0-18', 191, 196, '2020s', 250, [84, 76, 80, 74, 86, 86, 72, 82, 84, 86]],
    ['itauma', 'Moses Itauma', '', 'GBR', 'HW', 'S', 'boxer-puncher', '13-0-0-11', 196, 198, '2020s', 245, [88, 86, 84, 78, 80, 78, 80, 78, 76, 80]],
    ['ali', 'Muhammad Ali', 'The Greatest', 'USA', 'HW', 'O', 'boxer', '56-5-0-37', 191, 198, '1960s', 212, [80, 96, 88, 90, 94, 90, 98, 94, 82, 99]],
    ['tyson', 'Mike Tyson', 'Iron Mike', 'USA', 'HW', 'O', 'swarmer', '50-6-0-44', 178, 180, '1980s', 218, [97, 96, 86, 86, 84, 78, 86, 82, 84, 80]],
    ['lewis', 'Lennox Lewis', 'The Lion', 'GBR', 'HW', 'O', 'boxer-puncher', '41-2-1-32', 196, 213, '1990s', 245, [93, 80, 88, 84, 82, 82, 80, 92, 74, 88]],
    ['holmes', 'Larry Holmes', 'The Easton Assassin', 'USA', 'HW', 'O', 'boxer', '69-6-0-44', 191, 206, '1980s', 215, [82, 84, 88, 84, 90, 90, 86, 92, 80, 95]],
    ['frazier', 'Joe Frazier', "Smokin' Joe", 'USA', 'HW', 'O', 'swarmer', '32-4-1-27', 182, 185, '1970s', 205, [92, 84, 82, 76, 88, 92, 78, 80, 94, 99]],
    ['foreman', 'George Foreman', 'Big George', 'USA', 'HW', 'O', 'slugger', '76-5-0-68', 192, 208, '1970s', 222, [99, 74, 80, 70, 90, 74, 66, 78, 72, 90]],
    ['holyfield', 'Evander Holyfield', 'The Real Deal', 'USA', 'HW', 'O', 'boxer-puncher', '44-10-2-29', 189, 198, '1990s', 215, [84, 86, 86, 82, 90, 90, 82, 90, 86, 99]],
    ['wklitschko', 'Wladimir Klitschko', 'Dr. Steelhammer', 'UKR', 'HW', 'O', 'boxer-puncher', '64-5-0-53', 198, 206, '2000s', 245, [92, 82, 88, 86, 70, 84, 82, 88, 68, 82]],
    ['vklitschko', 'Vitali Klitschko', 'Dr. Ironfist', 'UKR', 'HW', 'O', 'boxer-puncher', '45-2-0-41', 201, 203, '2000s', 245, [90, 72, 84, 80, 94, 88, 72, 86, 80, 94]],
    ['marciano', 'Rocky Marciano', 'The Brockton Blockbuster', 'USA', 'HW', 'O', 'swarmer', '49-0-0-43', 179, 173, '1950s', 188, [93, 78, 74, 70, 94, 95, 74, 80, 94, 99]],
    ['louis', 'Joe Louis', 'The Brown Bomber', 'USA', 'HW', 'O', 'boxer-puncher', '66-3-0-52', 188, 193, '1940s', 200, [95, 88, 94, 74, 80, 82, 72, 88, 82, 90]],
    ['dempsey', 'Jack Dempsey', 'The Manassa Mauler', 'USA', 'HW', 'O', 'swarmer', '54-6-9-44', 185, 196, '1920s', 187, [94, 88, 80, 74, 84, 84, 82, 80, 90, 92]],
    ['liston', 'Sonny Liston', 'The Big Bear', 'USA', 'HW', 'O', 'slugger', '50-4-0-39', 185, 213, '1960s', 215, [94, 74, 86, 76, 88, 80, 70, 80, 74, 82]],
    ['bowe', 'Riddick Bowe', 'Big Daddy', 'USA', 'HW', 'O', 'boxer-puncher', '43-1-0-33', 196, 206, '1990s', 235, [88, 80, 84, 76, 88, 78, 74, 84, 82, 90]],

    // ── Cruiserweight ────────────────────────────────────────────
    ['opetaia', 'Jai Opetaia', '', 'AUS', 'CW', 'S', 'boxer-puncher', '28-0-0-21', 188, 193, '2020s', null, [86, 82, 84, 80, 86, 86, 80, 84, 82, 90]],
    ['zurdo', 'Gilberto Ramírez', 'Zurdo', 'MEX', 'CW', 'S', 'swarmer', '48-1-0-30', 189, 191, '2020s', null, [76, 74, 80, 74, 86, 90, 72, 80, 90, 88]],
    ['haye', 'David Haye', 'The Hayemaker', 'GBR', 'CW', 'O', 'boxer-puncher', '28-4-0-26', 191, 198, '2000s', null, [93, 92, 82, 80, 70, 70, 86, 82, 70, 76]],

    // ── Light Heavyweight ────────────────────────────────────────
    ['bivol', 'Dmitry Bivol', '', 'RUS', 'LHW', 'O', 'boxer', '24-1-0-12', 183, 183, '2020s', null, [72, 88, 90, 92, 88, 92, 90, 94, 86, 90]],
    ['beterbiev', 'Artur Beterbiev', '', 'RUS', 'LHW', 'O', 'slugger', '21-1-0-20', 182, 185, '2020s', null, [96, 76, 84, 72, 90, 88, 72, 84, 88, 96]],
    ['benavidez', 'David Benavidez', 'The Mexican Monster', 'USA', 'LHW', 'O', 'swarmer', '30-0-0-24', 188, 188, '2020s', null, [86, 84, 84, 72, 86, 86, 74, 80, 95, 90]],
    ['rjj', 'Roy Jones Jr.', 'Captain Hook', 'USA', 'LHW', 'O', 'boxer-puncher', '66-10-0-47', 180, 188, '1990s', null, [86, 99, 88, 92, 78, 82, 96, 88, 80, 82]],
    ['spinks', 'Michael Spinks', 'Jinx', 'USA', 'LHW', 'O', 'boxer-puncher', '31-1-0-21', 188, 193, '1980s', null, [84, 82, 82, 82, 84, 84, 82, 88, 78, 88]],
    ['green', 'Danny Green', 'The Green Machine', 'AUS', 'LHW', 'O', 'slugger', '36-5-0-28', 185, 188, '2000s', null, [88, 78, 80, 74, 82, 84, 72, 78, 80, 88]],
    ['foster', 'Bob Foster', '', 'USA', 'LHW', 'O', 'boxer-puncher', '56-8-1-46', 191, 201, '1970s', null, [93, 80, 90, 74, 70, 80, 74, 84, 74, 82]],
    ['moore', 'Archie Moore', 'The Old Mongoose', 'USA', 'LHW', 'O', 'counter', '186-23-10-131', 180, 191, '1950s', null, [90, 76, 88, 86, 86, 84, 72, 96, 72, 92]],

    // ── Super Middleweight ───────────────────────────────────────
    ['canelo', 'Canelo Álvarez', 'Canelo', 'MEX', 'SMW', 'O', 'counter', '63-3-2-39', 173, 179, '2020s', null, [86, 82, 88, 88, 92, 82, 74, 92, 72, 92]],
    ['crawford168', 'Terence Crawford (168)', 'Bud', 'USA', 'SMW', 'S', 'counter', '42-0-0-31', 173, 188, '2020s', null, [84, 88, 92, 90, 88, 88, 88, 98, 80, 94]],
    ['mbilli', 'Christian Mbilli', 'Solide', 'FRA', 'SMW', 'O', 'swarmer', '29-0-1-24', 173, 178, '2020s', null, [86, 82, 80, 74, 86, 90, 74, 78, 92, 90]],
    ['ward', 'Andre Ward', 'S.O.G.', 'USA', 'SMW', 'O', 'boxer', '32-0-0-16', 183, 180, '2010s', null, [74, 84, 86, 90, 88, 90, 86, 96, 80, 94]],
    ['calzaghe', 'Joe Calzaghe', 'The Pride of Wales', 'GBR', 'SMW', 'S', 'boxer', '46-0-0-32', 183, 185, '2000s', null, [78, 92, 84, 82, 86, 94, 88, 90, 97, 94]],
    ['mundine', 'Anthony Mundine', 'The Man', 'AUS', 'SMW', 'O', 'counter', '48-9-0-28', 180, 185, '2000s', null, [80, 88, 84, 84, 80, 84, 84, 82, 74, 82]],
    ['froch', 'Carl Froch', 'The Cobra', 'GBR', 'SMW', 'O', 'boxer-puncher', '33-2-0-24', 185, 191, '2010s', null, [86, 76, 82, 72, 90, 88, 74, 82, 84, 96]],

    // ── Middleweight ─────────────────────────────────────────────
    ['hagler', 'Marvin Hagler', 'Marvelous', 'USA', 'MW', 'S', 'boxer-puncher', '62-3-2-52', 175, 191, '1980s', null, [90, 84, 88, 84, 96, 94, 82, 90, 86, 98]],
    ['hopkins', 'Bernard Hopkins', 'The Executioner', 'USA', 'MW', 'O', 'counter', '55-8-2-32', 185, 191, '2000s', null, [80, 80, 86, 92, 90, 88, 80, 98, 68, 92]],
    ['ggg', 'Gennady Golovkin', 'GGG', 'KAZ', 'MW', 'O', 'swarmer', '42-2-1-37', 179, 178, '2010s', null, [93, 80, 88, 78, 95, 90, 82, 88, 86, 92]],
    ['monzon', 'Carlos Monzón', 'Escopeta', 'ARG', 'MW', 'O', 'boxer-puncher', '87-3-9-59', 182, 193, '1970s', null, [86, 80, 86, 82, 92, 92, 80, 88, 84, 94]],
    ['lamotta', 'Jake LaMotta', 'The Raging Bull', 'USA', 'MW', 'O', 'swarmer', '83-19-4-30', 173, 170, '1940s', null, [74, 76, 74, 70, 99, 92, 72, 74, 92, 99]],
    ['janibek', 'Janibek Alimkhanuly', 'Qazaq Style', 'KAZ', 'MW', 'S', 'boxer-puncher', '16-0-0-11', 185, 183, '2020s', null, [82, 82, 84, 80, 84, 86, 82, 84, 82, 86]],

    // ── Super Welterweight ───────────────────────────────────────
    ['hearns', 'Thomas Hearns', 'The Hitman', 'USA', 'SWW', 'O', 'boxer-puncher', '61-5-1-48', 185, 198, '1980s', null, [96, 88, 90, 76, 70, 80, 84, 84, 82, 92]],
    ['fundora', 'Sebastian Fundora', 'The Towering Inferno', 'USA', 'SWW', 'S', 'swarmer', '22-1-1-14', 197, 203, '2020s', null, [83, 80, 85, 74, 85, 88, 72, 80, 93, 90]],
    ['ortiz', 'Vergil Ortiz Jr.', '', 'USA', 'SWW', 'O', 'swarmer', '23-0-0-21', 178, 178, '2020s', null, [88, 80, 84, 74, 84, 86, 74, 80, 88, 88]],
    ['zayas', 'Xander Zayas', '', 'PUR', 'SWW', 'O', 'boxer-puncher', '22-0-0-13', 180, 180, '2020s', null, [78, 82, 82, 80, 82, 84, 80, 80, 80, 84]],
    ['timtszyu', 'Tim Tszyu', 'The Soul Taker', 'AUS', 'SWW', 'O', 'swarmer', '25-3-0-18', 175, 180, '2020s', null, [85, 80, 82, 74, 80, 86, 74, 78, 86, 94]],
    ['nikitatszyu', 'Nikita Tszyu', 'The Butcher', 'AUS', 'SWW', 'O', 'slugger', '11-0-0-9', 180, 183, '2020s', null, [86, 78, 78, 70, 82, 82, 72, 74, 86, 88]],
    ['winky', 'Winky Wright', '', 'USA', 'SWW', 'S', 'counter', '51-6-1-25', 178, 183, '2000s', null, [70, 78, 84, 92, 88, 88, 74, 90, 72, 86]],
    ['norris', 'Terry Norris', 'Terrible', 'USA', 'SWW', 'O', 'boxer-puncher', '47-9-0-31', 178, 183, '1990s', null, [84, 92, 84, 78, 68, 82, 84, 80, 82, 84]],

    // ── Welterweight ─────────────────────────────────────────────
    ['crawford', 'Terence Crawford', 'Bud', 'USA', 'WW', 'S', 'counter', '42-0-0-31', 173, 188, '2020s', null, [88, 90, 92, 90, 88, 90, 90, 98, 80, 95]],
    ['mayweather', 'Floyd Mayweather Jr.', 'Money', 'USA', 'WW', 'O', 'counter', '50-0-0-27', 173, 183, '2000s', null, [76, 95, 95, 99, 90, 90, 92, 99, 72, 92]],
    ['pacquiao', 'Manny Pacquiao', 'Pac-Man', 'PHI', 'WW', 'S', 'swarmer', '62-8-3-39', 166, 170, '2000s', null, [88, 97, 84, 80, 84, 92, 94, 84, 94, 96]],
    ['robinson', 'Sugar Ray Robinson', '', 'USA', 'WW', 'O', 'boxer-puncher', '174-19-6-109', 180, 184, '1940s', null, [92, 96, 94, 88, 90, 92, 94, 96, 88, 96]],
    ['leonard', 'Sugar Ray Leonard', '', 'USA', 'WW', 'O', 'boxer-puncher', '36-3-1-25', 178, 188, '1980s', null, [86, 96, 90, 88, 86, 88, 94, 94, 86, 96]],
    ['whitaker', 'Pernell Whitaker', 'Sweet Pea', 'USA', 'WW', 'S', 'counter', '40-4-1-17', 168, 175, '1990s', null, [66, 90, 88, 99, 88, 90, 94, 96, 80, 90]],
    ['delahoya', 'Oscar De La Hoya', 'The Golden Boy', 'USA', 'WW', 'O', 'boxer-puncher', '39-6-0-30', 179, 185, '1990s', null, [86, 90, 86, 80, 84, 82, 84, 84, 84, 86]],
    ['trinidad', 'Félix Trinidad', 'Tito', 'PUR', 'WW', 'O', 'slugger', '42-3-0-35', 180, 185, '1990s', null, [94, 84, 86, 72, 78, 84, 76, 82, 80, 90]],
    ['ennis', 'Jaron Ennis', 'Boots', 'USA', 'WW', 'O', 'boxer-puncher', '33-0-0-29', 178, 188, '2020s', null, [88, 88, 86, 84, 84, 86, 86, 84, 86, 86]],
    ['horn', 'Jeff Horn', 'The Hornet', 'AUS', 'WW', 'O', 'swarmer', '20-2-1-13', 175, 175, '2010s', null, [76, 74, 74, 70, 86, 88, 70, 74, 86, 94]],
    ['armstrong', 'Henry Armstrong', 'Homicide Hank', 'USA', 'WW', 'O', 'swarmer', '150-21-10-101', 165, 170, '1930s', null, [82, 86, 82, 74, 90, 99, 82, 84, 99, 99]],

    // ── Super Lightweight ────────────────────────────────────────
    ['teofimo', 'Teofimo López', 'The Takeover', 'USA', 'SLW', 'O', 'boxer-puncher', '22-1-0-13', 173, 175, '2020s', null, [86, 88, 84, 78, 82, 80, 82, 80, 76, 86]],
    ['haney', 'Devin Haney', 'The Dream', 'USA', 'SLW', 'O', 'boxer', '32-0-0-15', 173, 180, '2020s', null, [70, 84, 86, 86, 78, 86, 84, 90, 76, 86]],
    ['hitchins', 'Richardson Hitchins', '', 'USA', 'SLW', 'O', 'boxer', '19-0-0-7', 178, 178, '2020s', null, [66, 82, 84, 90, 80, 86, 86, 88, 74, 80]],
    ['chavez', 'Julio César Chávez', 'JC Superstar', 'MEX', 'SLW', 'O', 'swarmer', '107-6-2-85', 170, 168, '1990s', null, [88, 82, 90, 86, 94, 94, 80, 94, 90, 98]],
    ['tszyu', 'Kostya Tszyu', 'The Thunder from Down Under', 'AUS', 'SLW', 'O', 'boxer-puncher', '31-2-1-25', 170, 170, '2000s', null, [92, 84, 88, 80, 80, 82, 80, 86, 78, 88]],
    ['hatton', 'Ricky Hatton', 'The Hitman', 'GBR', 'SLW', 'O', 'swarmer', '45-3-0-32', 168, 165, '2000s', null, [80, 82, 80, 72, 84, 88, 76, 78, 94, 96]],
    ['pryor', 'Aaron Pryor', 'The Hawk', 'USA', 'SLW', 'O', 'swarmer', '39-1-0-35', 168, 175, '1980s', null, [86, 92, 82, 72, 88, 94, 84, 80, 98, 96]],

    // ── Lightweight ──────────────────────────────────────────────
    ['shakur', 'Shakur Stevenson', '', 'USA', 'LW', 'S', 'boxer', '24-0-0-11', 173, 173, '2020s', null, [72, 90, 92, 96, 84, 90, 92, 96, 70, 86]],
    ['tank', 'Gervonta Davis', 'Tank', 'USA', 'LW', 'S', 'counter', '30-0-1-28', 166, 171, '2020s', null, [95, 92, 88, 84, 84, 80, 84, 88, 70, 86]],
    ['loma', 'Vasiliy Lomachenko', 'Hi-Tech', 'UKR', 'LW', 'S', 'boxer', '18-3-0-12', 170, 166, '2010s', null, [76, 94, 90, 90, 84, 88, 98, 94, 90, 88]],
    ['keyshawn', 'Keyshawn Davis', 'The Businessman', 'USA', 'LW', 'O', 'boxer-puncher', '13-0-0-9', 175, 175, '2020s', null, [82, 88, 86, 84, 80, 82, 84, 82, 78, 82]],
    ['kambosos', 'George Kambosos Jr.', 'Ferocious', 'AUS', 'LW', 'O', 'boxer-puncher', '21-3-0-10', 175, 178, '2020s', null, [76, 80, 80, 80, 84, 86, 78, 80, 80, 90]],
    ['duran', 'Roberto Durán', 'Manos de Piedra', 'PAN', 'LW', 'O', 'swarmer', '103-16-0-70', 170, 168, '1970s', null, [92, 88, 88, 88, 94, 90, 84, 94, 90, 96]],
    ['jmm', 'Juan Manuel Márquez', 'Dinamita', 'MEX', 'LW', 'O', 'counter', '56-7-1-40', 170, 170, '2000s', null, [84, 86, 94, 86, 82, 86, 80, 96, 80, 94]],

    // ── Super Featherweight ──────────────────────────────────────
    ['arguello', 'Alexis Argüello', 'The Explosive Thin Man', 'NIC', 'SFW', 'O', 'boxer-puncher', '77-8-0-62', 178, 183, '1970s', null, [92, 80, 94, 80, 82, 86, 74, 92, 80, 92]],
    ['nelson', 'Azumah Nelson', 'The Professor', 'GHA', 'SFW', 'O', 'boxer-puncher', '39-6-2-28', 165, 170, '1990s', null, [86, 84, 86, 82, 88, 88, 78, 90, 82, 92]],
    ['morales', 'Erik Morales', 'El Terrible', 'MEX', 'SFW', 'O', 'boxer-puncher', '52-9-0-36', 173, 183, '2000s', null, [86, 82, 88, 78, 86, 88, 78, 88, 86, 96]],
    ['roach', 'Lamont Roach Jr.', '', 'USA', 'SFW', 'O', 'boxer-puncher', '25-1-2-10', 168, 175, '2020s', null, [72, 82, 82, 82, 84, 86, 80, 84, 80, 88]],

    // ── Featherweight ────────────────────────────────────────────
    ['naseem', 'Naseem Hamed', 'Prince', 'GBR', 'FW', 'S', 'counter', '36-1-0-31', 163, 160, '1990s', null, [93, 92, 84, 80, 78, 80, 90, 80, 74, 84]],
    ['sanchez', 'Salvador Sánchez', 'Chava', 'MEX', 'FW', 'O', 'counter', '44-1-1-32', 170, 175, '1980s', null, [86, 86, 92, 88, 88, 92, 82, 94, 82, 92]],
    ['pep', 'Willie Pep', "Will o' the Wisp", 'USA', 'FW', 'O', 'boxer', '229-11-1-65', 165, 168, '1940s', null, [60, 94, 86, 98, 78, 90, 99, 96, 82, 88]],
    ['barrera', 'Marco Antonio Barrera', 'The Baby-Faced Assassin', 'MEX', 'FW', 'O', 'boxer-puncher', '67-7-0-44', 170, 178, '2000s', null, [86, 84, 88, 82, 86, 88, 80, 90, 84, 94]],
    ['fenech', 'Jeff Fenech', 'The Marrickville Mauler', 'AUS', 'FW', 'O', 'swarmer', '29-3-1-21', 170, 173, '1980s', null, [86, 84, 82, 74, 88, 94, 78, 82, 96, 97]],
    ['famechon', 'Johnny Famechon', 'Johnny Famous', 'AUS', 'FW', 'O', 'boxer', '56-5-6-20', 168, 170, '1960s', null, [66, 84, 86, 90, 82, 88, 90, 92, 82, 88]],
    ['espinoza', 'Rafael Espinoza', '', 'MEX', 'FW', 'O', 'swarmer', '26-0-0-22', 185, 188, '2020s', null, [86, 80, 82, 72, 82, 88, 74, 78, 94, 88]],
    ['ball', 'Nick Ball', '', 'GBR', 'FW', 'O', 'swarmer', '22-0-1-13', 157, 160, '2020s', null, [80, 82, 78, 76, 88, 90, 76, 78, 92, 92]],

    // ── Super Bantamweight ───────────────────────────────────────
    ['inoue', 'Naoya Inoue', 'The Monster', 'JPN', 'SBW', 'O', 'boxer-puncher', '32-0-0-27', 165, 171, '2020s', null, [96, 94, 92, 90, 86, 88, 90, 96, 84, 92]],
    ['goodman', 'Sam Goodman', '', 'AUS', 'SBW', 'O', 'boxer', '19-0-0-8', 170, 173, '2020s', null, [72, 84, 84, 84, 82, 88, 84, 84, 82, 86]],
    ['gomez', 'Wilfredo Gómez', 'Bazooka', 'PUR', 'SBW', 'O', 'slugger', '44-3-1-42', 165, 170, '1970s', null, [94, 84, 86, 76, 80, 84, 78, 84, 84, 90]],

    // ── Bantamweight ─────────────────────────────────────────────
    ['nakatani', 'Junto Nakatani', 'Big Bang', 'JPN', 'BW', 'S', 'boxer-puncher', '31-0-0-24', 171, 173, '2020s', null, [90, 86, 88, 86, 82, 86, 84, 88, 82, 90]],
    ['rose', 'Lionel Rose', '', 'AUS', 'BW', 'O', 'boxer', '42-11-0-12', 168, 170, '1960s', null, [70, 86, 86, 86, 82, 86, 86, 88, 82, 90]],
    ['moloney', 'Jason Moloney', '', 'AUS', 'BW', 'O', 'boxer-puncher', '27-3-0-19', 168, 170, '2020s', null, [80, 80, 82, 80, 82, 86, 80, 82, 82, 88]],
    ['donaire', 'Nonito Donaire', 'The Filipino Flash', 'PHI', 'BW', 'O', 'counter', '42-8-0-28', 168, 175, '2010s', null, [92, 88, 88, 78, 82, 80, 80, 86, 70, 88]],
    ['jofre', 'Éder Jofre', 'Galo de Ouro', 'BRA', 'BW', 'O', 'boxer-puncher', '72-2-4-50', 163, 168, '1960s', null, [90, 84, 90, 84, 88, 88, 80, 92, 84, 92]],
    ['olivares', 'Rubén Olivares', 'El Púas', 'MEX', 'BW', 'O', 'slugger', '89-13-3-79', 165, 168, '1970s', null, [93, 84, 86, 74, 82, 82, 76, 84, 84, 90]],

    // ── Super Flyweight ──────────────────────────────────────────
    ['bam', 'Jesse Rodríguez', 'Bam', 'USA', 'SFLW', 'S', 'boxer-puncher', '22-0-0-15', 163, 170, '2020s', null, [86, 90, 90, 88, 84, 88, 88, 92, 84, 90]],
    ['chocolatito', 'Román González', 'Chocolatito', 'NIC', 'SFLW', 'O', 'swarmer', '51-4-0-41', 160, 163, '2010s', null, [86, 88, 92, 80, 84, 90, 80, 92, 96, 94]],
    ['khaosai', 'Khaosai Galaxy', 'The Thai Tyson', 'THA', 'SFLW', 'S', 'slugger', '47-1-0-41', 165, 168, '1980s', null, [94, 82, 84, 76, 86, 84, 74, 82, 80, 90]],

    // ── Flyweight ────────────────────────────────────────────────
    ['wonjongkam', 'Pongsaklek Wonjongkam', '', 'THA', 'FLW', 'S', 'boxer-puncher', '91-5-2-47', 163, 165, '2000s', null, [82, 84, 86, 82, 84, 88, 82, 86, 82, 88]],
    ['canto', 'Miguel Canto', 'El Maestro', 'MEX', 'FLW', 'O', 'boxer', '61-9-4-15', 160, 163, '1970s', null, [60, 88, 84, 92, 84, 90, 92, 92, 82, 88]],
    ['perez', 'Pascual Pérez', '', 'ARG', 'FLW', 'O', 'swarmer', '84-7-1-57', 152, 155, '1950s', null, [86, 86, 84, 80, 84, 90, 84, 84, 90, 92]],

    // ── Light Flyweight ──────────────────────────────────────────
    ['teraji', 'Kenshiro Teraji', '', 'JPN', 'LFW', 'O', 'boxer-puncher', '25-2-0-16', 172, 170, '2020s', null, [86, 84, 88, 82, 80, 86, 82, 88, 82, 88]],
    ['carbajal', 'Michael Carbajal', 'Little Hands of Stone', 'USA', 'LFW', 'O', 'slugger', '49-4-0-33', 160, 165, '1990s', null, [88, 84, 82, 74, 80, 84, 78, 82, 84, 94]],
    ['yuh', 'Yuh Myung-woo', '', 'KOR', 'LFW', 'O', 'swarmer', '38-1-0-14', 160, 163, '1980s', null, [70, 84, 84, 82, 86, 92, 84, 86, 94, 92]],

    // ── Minimumweight ────────────────────────────────────────────
    ['finito', 'Ricardo López', 'Finito', 'MEX', 'MIN', 'O', 'boxer-puncher', '51-0-1-38', 165, 165, '1990s', null, [88, 90, 94, 92, 88, 90, 88, 96, 84, 92]],
    ['wanheng', 'Wanheng Menayothin', '', 'THA', 'MIN', 'O', 'boxer', '54-1-0-19', 160, 160, '2010s', null, [64, 82, 84, 86, 84, 92, 84, 86, 86, 88]],
  ];

  BX.FIGHTERS = rows.map((r) => {
    const [id, name, nick, country, div, stance, style, rec, height, reach, era, lbs, ratings] = r;
    const [w, l, d, ko] = rec.split('-').map(Number);
    const attr = {};
    KEYS.forEach((k, i) => (attr[k] = ratings[i]));
    const parts = name.replace(/\s*\(.*\)$/, '').split(' ');
    return {
      id, name, nick, country, div, stance, style, era,
      record: { w, l, d, ko },
      height, reach, lbs, attr,
      short: parts.length > 1 ? parts.slice(1).join(' ') : parts[0],
    };
  });

  // Display surname overrides where the "last word" isn't how commentators say it.
  const SHORT = {
    canelo: 'Canelo', crawford168: 'Crawford', robinson: 'Robinson', leonard: 'Leonard', mayweather: 'Mayweather',
    rjj: 'Jones', zurdo: 'Zurdo', chocolatito: 'Chocolatito', bam: 'Bam', finito: 'Finito', tank: 'Tank',
    jmm: 'Márquez', chavez: 'Chávez', barrera: 'Barrera', naseem: 'Naseem', delahoya: 'De La Hoya',
    khaosai: 'Khaosai', yuh: 'Yuh', wanheng: 'Wanheng', ortiz: 'Ortiz', roach: 'Roach', wklitschko: 'Wladimir',
    vklitschko: 'Vitali', lamotta: 'LaMotta', tszyu: 'Kostya', timtszyu: 'Tim Tszyu', nikitatszyu: 'Nikita Tszyu', kambosos: 'Kambosos', winky: 'Wright', janibek: 'Janibek', loma: 'Lomachenko',
  };
  BX.FIGHTERS.forEach((f) => { if (SHORT[f.id]) f.short = SHORT[f.id]; });

  BX.ATTR_LABELS = {
    pow: 'Power', spd: 'Speed', acc: 'Accuracy', def: 'Defence', chin: 'Chin',
    sta: 'Stamina', foot: 'Footwork', iq: 'Ring IQ', work: 'Output', heart: 'Heart',
  };
  BX.ATTR_KEYS = KEYS;
  BX.divByKey = (k) => BX.DIVISIONS.find((d) => d.key === k);
  BX.fighterById = (id) => BX.FIGHTERS.find((f) => f.id === id);
})(typeof window !== 'undefined' ? window : globalThis);
