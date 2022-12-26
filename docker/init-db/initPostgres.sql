create table amazon_drive_items (
  id text not null primary key,
  data jsonb not null default '{}'::jsonb,
  downloaded_to text not null default '',
  error text null
);

--- view_amazon_drive_summary
create or replace view public.view_amazon_drive_summary as
SELECT a.kind, a.content_type, a.is_downloaded, count(*) AS cnt, sum(a.size::numeric) / 1000000000::numeric AS size
FROM (SELECT items.id,
          replace(((items.data::json -> 'kind'::text)::character varying)::text, '"'::text, ''::text)              AS kind,
          replace(((items.data::json -> 'name'::text)::character varying)::text, '"'::text,
                  ''::text)                                                                                        AS name,
          (items.data::json -> 'contentProperties'::text) ->> 'size'::text                                         AS size,
          (string_to_array((items.data::json -> 'contentProperties'::text) ->> 'contentType'::text,
                           '/'::text))[1]                                                                          AS content_type,
          case when LENGTH(downloaded_to) > 0 then true else false end is_downloaded
      FROM amazon_drive_items items
) a
WHERE a.kind = ANY (ARRAY ['FILE'::text, 'ASSET'::text])
GROUP BY a.kind, a.content_type, a.is_downloaded;

alter table public.view_amazon_drive_summary  owner to postgres;

---- view_amazon_drive_items ---
create view public.view_amazon_drive_items as
select * from (
   SELECT items.id,
          items.downloaded_to,
             replace(((items.data::json -> 'kind'::text)::character varying)::text, '"'::text, ''::text)              AS kind,
             replace(((items.data::json -> 'name'::text)::character varying)::text, '"'::text,
                     ''::text)                                                                                        AS name,
             (items.data::json -> 'contentProperties'::text) ->> 'size'::text                                         AS size,
             (string_to_array((items.data::json -> 'contentProperties'::text) ->> 'contentType'::text, '/'::text))[1]  AS content_type,
            replace(((items.data::json -> 'contentUrl'::text)::character varying)::text, '"'::text, ''::text) as content_url
       FROM amazon_drive_items items
   ) a;


alter table public.view_amazon_drive_items
    owner to postgres;
