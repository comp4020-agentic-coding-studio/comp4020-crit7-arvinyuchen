# Crit 7 reflection

## What was the breakthrough that moved the work forward?

The breakthrough came from Claude itself. Before writing any code, it asked me
which part of ANU timetabling ruins my week, and the options it offered were
exactly the problems I had already been thinking about with the old ANU
timetabling system: clashes you only discover after choosing, sessions that
fill up, no single weekly view, and swaps that feel risky. I picked all four.
Once those were named, the rest of the work had a clear shape, because every
feature answers one of them.

## What did this work change about who I want to be as a software developer?

It is already very hard to review all of the code Claude writes, so reading
every line is not a realistic way to trust the work. I want to lean on
test-oriented development instead: write the checks first, so that the work
Claude does is proven reliable by something other than my own reading of it.
This week the spec test was committed red before any of the app existed, and
turning it green is what told me the core flow actually worked.
