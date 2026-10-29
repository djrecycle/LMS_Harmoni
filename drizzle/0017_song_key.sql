-- Songs written in note letters or the piano roll used to store "C4" as a placeholder key.
-- Their key is now chosen by the teacher; "" means "detect it from the notes".
UPDATE "piano_song" SET "do_note" = '' WHERE "format" <> 'angka';
