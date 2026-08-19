# Gaandes abstract PDF template

`gaandes-abstract-template.tex` is a self-contained A4 template for talk
abstracts. It uses the same navy (`#0D1B2A`) and gold (`#D7B16D`) palette as
the conference website and automatic emails, while keeping the main page
white and print-friendly. It is suitable for abstracts containing ordinary
text and mathematical notation.

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

## Website workflow

Once the PDFs are ready, place them in a dedicated directory such as
`pdfs/abstracts/`. Each file can then be linked from the matching talk card in
the website's Materials section. Keep the `.tex` source files in this folder
so abstracts can be corrected and regenerated later.
