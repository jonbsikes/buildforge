# build\_stages.md — BuildForge Master Build Stage List

This file defines build stages for two distinct project types. Stages, Gantt tracks, and day schedules are **not interchangeable** between project types.

\---

# 🏠 Project Type: Home Construction

55 stages total. Used for the per-project `build\\\\\\\_stages` table and the interactive Gantt chart.

The Gantt chart uses two parallel tracks:

* **Exterior track:** foundation, framing, roofing, siding, masonry, flatwork, landscaping, and related exterior work
* **Interior track:** rough MEP, insulation, drywall, trim, cabinets, paint, flooring, tile, finishes

## Stage List

|#|Stage|
|-|-|
|1|Lot prep and layout|
|2|Pad grading|
|3|Temp utilities \& site setup|
|4|Foundation - Set forms \& Trench|
|5|Plumbing - Underground|
|6|Electrical - Underground (ENT)|
|7|Foundation (cables/rebar)|
|8|Pour slab|
|9|Construction Clean - 1/7 - Forms|
|10|Rough grade|
|11|Framing – walls \& trusses|
|12|Sheathing – walls and roof|
|13|Weather barrier (WRB)|
|14|Windows and exterior doors|
|15|Water Well Install|
|16|Plumbing - Top‑Out|
|17|HVAC - Rough|
|18|Roofing|
|19|Electrical - Rough|
|20|Construction Clean - 2/7 - Frame|
|21|Siding – exterior cladding|
|22|Insulation|
|23|Drywall – hang, tape, texture|
|24|Construction Clean - 3/7 - Drywall|
|25|Garage door - Rough (door and tracks)|
|26|Paint - Exterior|
|27|Masonry/brick/stone|
|28|Construction Clean - 4/7 - Brick|
|29|Septic system rough in|
|30|Interior doors \& trim|
|31|Cabinets|
|32|Construction Clean - 5/7 - Trim|
|33|Paint - interior|
|34|Countertops|
|35|Fireplace|
|36|Construction Clean - 6/7 - Paint \& Tile|
|37|Flatwork – driveway, walks, patios|
|38|Final grade|
|39|Landscape/Irrigation - Rough|
|40|Flooring Install|
|41|Tile|
|42|Electrical - Final|
|43|Plumbing - Final|
|44|HVAC - Final|
|45|Hardware|
|46|Garage door - Final (operator/opener)|
|47|Appliances|
|48|Mirrors/Glass|
|49|Paint - interior finish \& touch‑ups|
|50|Gutter install|
|51|Landscape - Final|
|52|Construction Clean - 7/7 - Final|
|53|Punch list \& touch‑ups|
|54|Final Clean|
|55|Final inspections \& utility releases|

## Gantt Track Assignment

|Track|Stages|
|-|-|
|**Exterior**|1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 21, 25, 26, 27, 28, 29, 37, 38, 39, 50, 51|
|**Interior**|16, 17, 19, 22, 23, 24, 30, 31, 32, 33, 34, 35, 36, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 52, 53, 54, 55|

> Some stages (e.g. clean-up stages) may appear on both tracks or be shown as milestones depending on the Gantt implementation. The above is the default assignment. The stage report below should be the pre populated schedule once a home construction project is created. This schedule should use days from start date input when the project was created. 

\---

## Home Construction Stage Report

|Day|Stage(s)|Interior Activity|Exterior Activity|
|-|-|-|-|
|1|1||Lot prep and layout|
|2|1, 2||Lot prep / Pad grading|
|3|2||Pad grading|
|4|3||Temp utilities \& site setup|
|5|4||Foundation - Set forms \& Trench|
|6|4||Foundation - Set forms \& Trench|
|7|5||Plumbing - Underground|
|8|5||Plumbing - Underground|
|9|5, 6||Plumb Und. / Elec Und.|
|10|6||Electrical - Underground|
|11|6||Electrical - Underground|
|12|7||Foundation (cables/rebar)|
|13|7||Foundation (cables/rebar)|
|14|8||Pour slab|
|15|8||Pour slab|
|16|9||Construction Clean - 1/7 - Forms|
|17|10||Rough grade|
|18|10||Rough grade|
|19|11||Framing – walls \& trusses|
|20|11||Framing – walls \& trusses|
|21|11||Framing – walls \& trusses|
|22|11||Framing – walls \& trusses|
|23|11||Framing – walls \& trusses|
|24|12||Sheathing – walls and roof|
|25|12||Sheathing – walls and roof|
|26|13||Weather barrier (WRB)|
|27|13||Weather barrier (WRB)|
|28|13||Weather barrier (WRB)|
|29|14||Windows and exterior doors|
|30|14||Windows and exterior doors|
|31|14, 16|Plumbing - Top‑Out|Windows and exterior doors|
|32|14, 16|Plumbing - Top‑Out|Windows and exterior doors|
|33|14, 16|Plumbing - Top‑Out|Windows and exterior doors|
|34|14, 15|Plumbing - Top‑Out|Water Well Install|
|35|15, 17|HVAC - Rough|Water Well Install|
|36|15, 17|HVAC - Rough|Water Well Install|
|37|15, 17|HVAC - Rough|Water Well Install|
|38|15, 17|HVAC - Rough|Water Well Install|
|39|15, 17|HVAC - Rough|Water Well Install|
|40|18, 19|Electrical - Rough|Roofing|
|41|18, 19|Electrical - Rough|Roofing|
|42|18, 19|Electrical - Rough|Roofing|
|43|19, 21|Electrical - Rough|Siding – exterior cladding|
|44|19, 21|Electrical - Rough|Siding – exterior cladding|
|45|19, 21|Electrical - Rough|Siding – exterior cladding|
|46|21, 22|Insulation|Siding – exterior cladding|
|47|21, 22|Insulation|Siding – exterior cladding|
|48|20, 22|Insulation|Construction Clean - 2/7 - Frame|
|49|22|Insulation||
|50|22|Insulation||
|51|23|Drywall||
|52|23|Drywall||
|53|23|Drywall||
|54|23|Drywall||
|55|23|Drywall||
|56|23|Drywall||
|57|23|Drywall||
|58|23|Drywall||
|59|23|Drywall||
|60|23|Drywall||
|61|23|Drywall||
|62|25||Garage door - Rough|
|63|25||Garage door - Rough|
|64|25||Garage door - Rough|
|65|24|Construction Clean - 3/7 - Drywall||
|66|27, 30|Interior doors \& trim|Masonry|
|67|27, 30|Interior doors \& trim|Masonry|
|68|27, 30|Interior doors \& trim|Masonry|
|69|27, 30|Interior doors \& trim|Masonry|
|70|27, 30|Interior doors \& trim|Masonry|
|71|27, 30|Interior doors \& trim|Masonry|
|72|27, 30|Interior doors \& trim|Masonry|
|73|27, 30|Interior doors \& trim|Masonry|
|74|27, 30|Interior doors \& trim|Masonry|
|75|26, 31|Cabinets|Paint - Exterior|
|76|26, 31|Cabinets|Paint - Exterior|
|77|26, 31|Cabinets|Paint - Exterior|
|78|26, 31|Cabinets|Paint - Exterior|
|79|26, 31|Cabinets|Paint - Exterior|
|80|26, 31|Cabinets|Paint - Exterior|
|81|32|Construction Clean - 5/7 - Trim|—|
|82|33, 29|Paint - interior|Septic system rough in|
|83|33, 29|Paint - interior|Septic system rough in|
|84|33, 29|Paint - interior|Septic system rough in|
|85|33, 29|Paint - interior|Septic system rough in|
|86|33, 29|Paint - interior|Septic system rough in|
|87|37||Flatwork|
|88|37||Flatwork|
|89|37||Flatwork|
|90|37||Flatwork|
|91|37||Flatwork|
|92|34, 35, 38|Countertops / Fireplace|Final grade|
|93|34, 35, 38|Countertops / Fireplace|Final grade|
|94|34, 35, 38|Countertops / Fireplace|Final grade|
|95|34, 35, 39|Countertops / Fireplace|Landscape/Irrigation - Rough|
|96|36, 39|Construction Clean - 6/7|Landscape/Irrigation - Rough|
|97|40|Flooring Install||
|98|40|Flooring Install||
|99|40|Flooring Install||
|100|40|Flooring Install||
|101|40|Flooring Install||
|102|40|Flooring Install||
|103|40|Flooring Install||
|104|40|Flooring Install||
|105|40|Flooring Install||
|106|40|Flooring Install||
|107|41|Tile||
|108|41|Tile||
|109|41|Tile||
|110|41|Tile||
|111|42|Electrical - Final||
|112|42|Electrical - Final||
|113|42|Electrical - Final||
|114|42|Electrical - Final||
|115|43|Plumbing - Final||
|116|43|Plumbing - Final||
|117|43|Plumbing - Final||
|118|43|Plumbing - Final||
|119|44|HVAC - Final||
|120|44|HVAC - Final||
|121|44|HVAC - Final||
|122|44|HVAC - Final||
|123|45|Hardware||
|124|45|Hardware||
|125|45|Hardware||
|126|46|Garage door - Final||
|127|46|Garage door - Final||
|128|46|Garage door - Final||
|129|47|Appliances||
|130|47|Appliances||
|131|47|Appliances||
|132|48, 50|Mirrors/Glass|Gutter install|
|133|48, 50|Mirrors/Glass|Gutter install|
|134|48, 50|Mirrors/Glass|Gutter install|
|135|49, 51|Paint - interior finish|Landscape - Final|
|136|49, 51|Paint - interior finish|Landscape - Final|
|137|49, 51|Paint - interior finish|Landscape - Final|
|138|51, 52|Construction Clean - 7/7 (1/3)|Landscape - Final|
|139|51, 53|Punch list \& touch‑ups|Landscape - Final|
|140|51, 53|Punch list \& touch‑ups|Landscape - Final|
|141|51, 53|Punch list \& touch‑ups|Landscape - Final|
|142|53|Punch list \& touch‑ups||
|143|53|Punch list \& touch‑ups||
|144|53|Punch list \& touch‑ups||
|145|53|Punch list \& touch‑ups|Final Inspections / Utility Release|
|146|53|Punch list \& touch‑ups|Final Inspections / Utility Release|
|147|54|Final Clean|Final Inspections / Utility Release|
|148|55||Final Inspections / Utility Release|
|149|55||Final Inspections / Utility Release|
|150|55||Final Inspections / Utility Release|
|151|55||Final Inspections / Utility Release|
|152|55||Final Inspections / Utility Release|

\---

# 🏗️ Project Type: Land Development

24 stages total. Used exclusively for land development projects (subdivision infrastructure, lot preparation, utilities, and entitlements). These stages are **separate from and not compatible with** the Home Construction stage list above.

## Stage List

|#|Stage|
|-|-|
|1|Survey|
|2|Engineering|
|3|Environmental Study / Phase 1|
|4|Geotechnical / Soil Testing|
|5|Site Clearing|
|6|Earth Work|
|7|Detention / Retention Pond|
|8|Water|
|9|Storm Sewer|
|10|Sanitary Sewer|
|11|Paving|
|12|Flatwork|
|13|Utilities - Electrical|
|14|Utilities - Gas|
|15|Utilities - Internet|
|16|Fencing|
|17|Monument Signs/Entry Features|
|18|Postal Service Boxes|
|19|Irrigation|
|20|Landscaping|
