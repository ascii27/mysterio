/** Curated Maple Hollow roster — the canonical shared cast/places for generation (3c). */
export interface SeedCharacter {
  id: string;
  name: string;
  description: string;
  traits: string;
}
export interface SeedPlace {
  id: string;
  name: string;
  description: string;
}

export const SEED_CHARACTERS: SeedCharacter[] = [
  { id: "mayor-ada-finch", name: "Mayor Ada Finch", description: "Maple Hollow's brisk, big-hearted mayor who knows every family by name.", traits: "organized, proud of the town, talks fast" },
  { id: "clockmaker-bram-hale", name: "Bram Hale", description: "The town clockmaker, gruff but fair, with ink-stained fingers and a pocketful of tiny gears.", traits: "precise, suspicious of strangers, never late" },
  { id: "diner-owner-rosa-pine", name: "Rosa Pine", description: "Owner of the Maple Diner; she remembers everyone's usual order and overhears half the town's secrets.", traits: "warm, gossipy, sharp memory" },
  { id: "librarian-jun-okafor", name: "Jun Okafor", description: "The quiet librarian who shelves books by feel and keeps a list of every overdue title.", traits: "observant, soft-spoken, tidy" },
  { id: "paperboy-milo-dart", name: "Milo Dart", description: "The fastest paperboy in town, on his bike before sunrise, knows which porch lights come on when.", traits: "restless, early riser, knows every shortcut" },
  { id: "baker-greta-stone", name: "Greta Stone", description: "The baker whose cinnamon buns draw a line out the door; flour dusts everything she touches.", traits: "generous, stubborn, up before dawn" },
  { id: "vet-dr-omar-reed", name: "Dr. Omar Reed", description: "The town vet who treats everything from hamsters to horses and keeps treats in every pocket.", traits: "gentle, scattered, loves animals" },
  { id: "gardener-pip-vale", name: "Pip Vale", description: "The community gardener who tends the square's flowerbeds and always has dirt under their nails.", traits: "patient, knows every plant, hums while working" },
  { id: "shopkeeper-nadia-frost", name: "Nadia Frost", description: "Runs the general store; she can find anything in the back and forgets nothing she's sold.", traits: "thrifty, exact, no-nonsense" },
  { id: "fisher-cole-marsh", name: "Cole Marsh", description: "Spends dawn at the pond with a rod and a thermos; sees who comes and goes by the water.", traits: "quiet, weatherwise, keeps to himself" },
  { id: "teacher-iris-bell", name: "Iris Bell", description: "The beloved schoolteacher who plans every field trip down to the minute.", traits: "encouraging, meticulous, fair" },
  { id: "mechanic-sal-rivera", name: "Sal Rivera", description: "The garage mechanic with grease on her sleeves who can name a car by its engine cough.", traits: "practical, blunt, good with her hands" },
  { id: "musician-theo-lark", name: "Theo Lark", description: "Plays fiddle on the square steps and knows the words to every old town song.", traits: "dreamy, friendly, forgetful" },
  { id: "postmaster-edith-crane", name: "Edith Crane", description: "The postmaster who sorts every letter and notices when a stamp looks wrong.", traits: "curious, by-the-book, eagle-eyed" },
];

export const SEED_PLACES: SeedPlace[] = [
  { id: "maple-diner", name: "The Maple Diner", description: "A cozy chrome-and-vinyl diner on Main Street where the whole town turns up for pie." },
  { id: "town-library", name: "Maple Hollow Library", description: "A small stone library with creaky stacks and a reading nook by the window." },
  { id: "clocktower-square", name: "Clocktower Square", description: "The cobbled town square beneath the old clock tower, ringed with flowerbeds and benches." },
  { id: "general-store", name: "Frost's General Store", description: "A crowded shop that sells a little of everything, from fishing line to birthday candles." },
  { id: "the-bakery", name: "Stone's Bakery", description: "A warm corner bakery whose front window fogs with the smell of cinnamon." },
  { id: "millpond", name: "The Millpond", description: "A still pond at the edge of town with a leaning dock and an old water wheel." },
  { id: "schoolhouse", name: "Maple Hollow Schoolhouse", description: "A red-brick schoolhouse with a bell, a wide yard, and a vegetable garden out back." },
  { id: "garage", name: "Rivera's Garage", description: "A busy repair garage smelling of oil and rubber, tools hung in neat rows." },
  { id: "post-office", name: "The Post Office", description: "A tidy little post office with brass mailboxes and a counter worn smooth by elbows." },
];
