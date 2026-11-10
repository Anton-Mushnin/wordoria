with incoming(term, translation, position) as (
  values
    ('ett egnahemshus', 'detached house', 0),
    ('en villa', 'villa / detached house', 1),
    ('ett höghus', 'apartment building / high-rise', 2),
    ('ett radhus', 'row house / townhouse', 3),
    ('ett parhus', 'semi-detached house / duplex', 4),
    ('ett sovrum', 'bedroom', 5),
    ('ett vardagsrum', 'living room', 6),
    ('ett kök', 'kitchen', 7),
    ('en tambur', 'hallway / entryway', 8),
    ('en toalett', 'toilet / restroom', 9),
    ('en bastu', 'sauna', 10),
    ('ett badrum', 'bathroom', 11),
    ('ett sommarparadis', 'summer paradise', 12),
    ('vara, är', 'to be', 13),
    ('hennes', 'her / hers', 14),
    ('ha, har', 'to have', 15),
    ('en sommarstuga', 'summer cottage', 16),
    ('på Åland', 'on Åland', 17),
    ('berätta, berättar om', 'to tell about', 18),
    ('vår / vårt / våra', 'our / ours', 19),
    ('en stuga', 'cottage / cabin', 20),
    ('grå / grått / gråa', 'grey', 21),
    ('en gård', 'yard / farmstead', 22),
    ('också', 'also / too', 23),
    ('liten / litet / små', 'small', 24),
    ('så', 'so', 25),
    ('äta, äter', 'to eat', 26),
    ('dela, delar', 'to share / divide', 27),
    ('min / mitt / mina', 'my / mine', 28),
    ('ett rum', 'room', 29),
    ('med', 'with', 30),
    ('en bror', 'brother', 31),
    ('mycket', 'much / a lot', 32),
    ('tillsammans', 'together', 33),
    ('en våningssäng', 'bunk bed', 34),
    ('en soffa', 'sofa / couch', 35),
    ('en hylla', 'shelf', 36),
    ('extra', 'extra', 37),
    ('för', 'for / because', 38),
    ('ofta', 'often', 39),
    ('en gäst', 'guest', 40),
    ('på sommaren', 'in the summer', 41),
    ('en strand', 'beach / shore', 42),
    ('simma, simmar', 'to swim', 43),
    ('där', 'there', 44),
    ('varje dag', 'every day', 45),
    ('bruka, brukar', 'to usually do / tend to', 46),
    ('fiska, fiskar', 'to fish', 47),
    ('hoppa, hoppar', 'to jump', 48),
    ('en trampolin', 'trampoline', 49),
    ('göra, gör', 'to do / make', 50),
    ('en hängmatta', 'hammock', 51),
    ('en trädgård', 'garden', 52),
    ('ligga, ligger', 'to lie / be located', 53),
    ('gärna', 'gladly / would like to', 54),
    ('läsa, läser', 'to read', 55),
    ('miljövänlig / miljövänligt / miljövänliga', 'environmentally friendly', 56),
    ('få, får', 'to get / be allowed to', 57),
    ('el, elen', 'electricity', 58),
    ('från', 'from', 59),
    ('solpaneler', 'solar panels', 60),
    ('tycka, tycker om', 'to like', 61),
    ('kan', 'can / able to', 62),
    ('ta det lugnt', 'take it easy', 63),
    ('ta, tar', 'to take', 64),
    ('en sjö', 'lake', 65),
    ('eller', 'or', 66),
    ('ett hav', 'sea / ocean', 67),
    ('en båt', 'boat', 68),
    ('en bil', 'car', 69),
    ('kött, köttet', 'meat', 70)
),
new_words as (
  insert into public.words (term, translation)
  select term, translation from incoming
  returning id, term, translation
),
new_list as (
  insert into public.word_lists (title, source)
  values ('Selmas sommarparadis', 'server')
  returning id
)
insert into public.list_words (list_id, word_id, position)
select new_list.id, new_words.id, incoming.position
from incoming
join new_words on new_words.term = incoming.term and new_words.translation = incoming.translation
cross join new_list;
