# Gaandes PDF templates

`gaandes-abstract-template.tex` is a self-contained A4 template for talk
abstracts. It uses the same navy (`#0D1B2A`) and gold (`#D7B16D`) palette as
the conference website and automatic emails, while keeping the main page
white and print-friendly. It is suitable for abstracts containing ordinary
text and mathematical notation.

`gaandes-poster-proposal-template.tex` is the matching A4 abstract template
for poster proposals. It preserves the talk template's design and includes
the poster title, presenting author, affiliation, contact email, co-authors,
abstract, supporting PDF, and the date and time the proposal was received.
Record the time in 24-hour format and include the time zone, for example
`20 August 2026, 14:35 CLT`.

## Create an abstract

1. Duplicate `gaandes-abstract-template.tex` and give the copy a descriptive
   name, such as `name1-name2-abstract.tex`.
2. In Prism, create a blank project and paste the complete template into its
   main `.tex` file. Edit only the marked metadata block near the top.
3. Compile in Prism. For a local copy, the equivalent command is:

   ```text
   pdflatex name1-name2-abstract.tex
   ```

   The file can also be uploaded to Overleaf and compiled with pdfLaTeX.
4. Use a stable lowercase filename for the finished PDF, for example
   `name1-name2-abstract.pdf`.

Optional fields such as email, talk date, and time may be left empty with
`{}`. Escape LaTeX special characters in entered text (`\&`, `\%`, `\#`,
`\_`, `\{`, and `\}`).

## Create a poster proposal record

1. Duplicate `gaandes-poster-proposal-template.tex` and give the copy a
   descriptive name, such as `presenting-author-poster-proposal.tex`.
2. Edit only the marked poster-proposal block near the top of the file.
3. Compile it in Prism or Overleaf, or run:

   ```text
   pdflatex presenting-author-poster-proposal.tex
   ```

4. Use a stable lowercase filename for the finished PDF, such as
   `presenting-author-poster-proposal.pdf`.

Leave `\CoAuthors`, `\SupportingPDFName`, and `\SupportingPDFURL` empty with
`{}` when they do not apply. An empty co-author field is omitted, while an
empty supporting-PDF field displays an appropriate fallback. If a supporting
file exists, set `\SupportingPDFName` to the visible filename and
`\SupportingPDFURL` to its web address or local relative path.

## Website workflow

Once the PDFs are ready, place them in a dedicated directory such as
`pdfs/abstracts/`. Each file can then be linked from the matching talk card in
the website's Materials section. Keep the `.tex` source files in this folder
so abstracts can be corrected and regenerated later.
