// October 1 launch checklist, returned only after authorization.
export const launchSeedBuckets = [
  {
    "id": "air-france",
    "kicker": "Project 01 · 07:00 am launch",
    "title": "Air France KLM",
    "groups": [
      {
        "id": "air-france",
        "title": "07:00 am · Air France KLM",
        "description": "Air France KLM Visa Signature® credit card launch",
        "tasks": [
          {
            "id": "af-crawl",
            "title": "Crawl & prepare Air France KLM",
            "stages": [
              "Crawls started"
            ],
            "notes": "Cover every affected card and partner placement; attach source snapshots and the before/after diff. Exact card list still needs confirmation.",
            "tags": [
              "Pre-launch"
            ]
          },
          {
            "id": "af-feed",
            "title": "Update the Affil feed",
            "stages": [
              "Feed changes prepared",
              "Changelog verified"
            ],
            "notes": "Check each affected card. Confirm new values and effective timing against the issuer source.",
            "tags": []
          },
          {
            "id": "af-mockups",
            "title": "Submit mockups for launch approval",
            "stages": [
              "Mockups prepared",
              "Submitted for approval",
              "Approval received & affiliate links deployed"
            ],
            "notes": "Include affected placements and updated terms. Record approval evidence before publishing.",
            "tags": []
          },
          {
            "id": "af-docs",
            "title": "Update card compliance documentation",
            "stages": [
              "Compliance changes drafted"
            ],
            "notes": "Update each card’s corresponding documentation and attach final links.",
            "tags": []
          },
          {
            "id": "af-qa",
            "title": "Live QA completed by another person",
            "stages": [
              "Live QA complete"
            ],
            "notes": "At or after 7:00 am, check approved copy, live rates/terms, application links, placements, and changelog. Record any remaining exceptions.",
            "tags": []
          },
          {
            "id": "af-email",
            "title": "Email BOFA partners about the launch",
            "stages": [
              "Partner list confirmed",
              "Email drafted",
              "Email sent"
            ],
            "notes": "Use approved launch details and application links. Confirm any embargo restrictions before sending.",
            "tags": [
              "BOFA partners"
            ]
          }
        ]
      },
      {
        "id": "af-content",
        "title": "Air France KLM · Content distribution",
        "tasks": [
          {
            "id": "af-threads",
            "title": "Threads",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified.",
            "tags": []
          },
          {
            "id": "af-reddit",
            "title": "Reddit",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified. Check each community’s posting rules.",
            "tags": []
          },
          {
            "id": "af-facebook-groups",
            "title": "Facebook Groups",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified. Check each community’s posting rules.",
            "tags": []
          },
          {
            "id": "af-tiktok",
            "title": "TikTok",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified.",
            "tags": []
          }
        ]
      }
    ]
  },
  {
    "id": "bofa-apr",
    "kicker": "Project 02 · Rate maintenance",
    "title": "BOFA APR",
    "groups": [
      {
        "id": "apr",
        "title": "08:00 am → 12:00 pm · Rate updates",
        "description": "Crawl, update, approve, document, verify. Complete by noon.",
        "tasks": [
          {
            "id": "apr-crawl",
            "title": "Crawl & stage the APR changes",
            "stages": [
              "Crawls started"
            ],
            "notes": "Confirm the affected BOFA cards, crawl current rates, and stage the issuer-approved APR values before 8:00 am.",
            "tags": [
              "Pre-launch"
            ]
          },
          {
            "id": "apr-feed",
            "title": "Update APRs in the Affil feed",
            "stages": [
              "Changelog verified"
            ],
            "notes": "Apply the new rates from 8:00 am and confirm each affected card has a changelog.",
            "tags": []
          },
          {
            "id": "apr-mockups",
            "title": "Submit updated-rate mockups",
            "stages": [
              "Submitted for approval",
              "Approval received & affiliate links deployed"
            ],
            "notes": "Prepare the affected APR placements and attach the approval record.",
            "tags": []
          },
          {
            "id": "apr-docs",
            "title": "Update APR compliance docs",
            "stages": [
              "Compliance changes drafted"
            ],
            "notes": "Replace the affected rates in each card’s compliance documentation and attach the final links.",
            "tags": []
          },
          {
            "id": "apr-compliance-run-nerdwallet",
            "title": "Compliance run · NerdWallet",
            "stages": [],
            "notes": "Run compliance on NerdWallet’s affected BOFA APR placements. Attach the results and record any issues.",
            "tags": []
          },
          {
            "id": "apr-qa",
            "title": "Live QA completed by another person",
            "stages": [
              "Live QA complete"
            ],
            "notes": "By 12:00 pm, reconcile the feed, live placements, approved mockups, and compliance docs against the issuer source.",
            "tags": [
              "12:00 pm deadline"
            ]
          }
        ]
      },
      {
        "id": "apr-content",
        "title": "Content docket",
        "tasks": [
          {
            "id": "apr-threads",
            "title": "Threads",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified.",
            "tags": []
          },
          {
            "id": "apr-reddit",
            "title": "Reddit",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified. Check each community’s posting rules.",
            "tags": []
          },
          {
            "id": "apr-facebook-groups",
            "title": "Facebook Groups",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified. Check each community’s posting rules.",
            "tags": []
          },
          {
            "id": "apr-tiktok",
            "title": "TikTok",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified.",
            "tags": []
          }
        ],
        "collapsed": true,
        "description": "Threads, Reddit, Facebook Groups, and TikTok remain on the docket. Keep the rate-update checklist in focus."
      }
    ]
  },
  {
    "id": "ihg",
    "kicker": "Project 03 · 05:00 am release",
    "title": "IHG cards",
    "groups": [
      {
        "id": "ihg-ops",
        "title": "05:00 am · Card updates",
        "description": "Embargo lifts before partner news is sent",
        "tasks": [
          {
            "id": "ihg-crawl",
            "title": "Crawl & prepare IHG cards",
            "stages": [
              "Crawls started"
            ],
            "notes": "Cover every affected card and partner placement; attach source snapshots and the before/after diff. Exact card list still needs confirmation.",
            "tags": [
              "Pre-launch"
            ]
          },
          {
            "id": "ihg-feed",
            "title": "Update the Affil feed",
            "stages": [
              "Feed changes prepared",
              "Changelog verified"
            ],
            "notes": "Check each affected card. Confirm new values and effective timing against the issuer source.",
            "tags": []
          },
          {
            "id": "ihg-mockups",
            "title": "Submit mockups for launch approval",
            "stages": [
              "Mockups prepared",
              "Submitted for approval",
              "Approval received & affiliate links deployed"
            ],
            "notes": "Include affected placements and updated terms. Record approval evidence before publishing.",
            "tags": []
          },
          {
            "id": "ihg-docs",
            "title": "Update card compliance documentation",
            "stages": [
              "Compliance changes drafted"
            ],
            "notes": "Update each card’s corresponding documentation and attach final links.",
            "tags": []
          },
          {
            "id": "ihg-compliance-run-nerdwallet",
            "title": "Compliance run · NerdWallet",
            "stages": [],
            "notes": "Run compliance on NerdWallet’s affected IHG card placements. Attach the results and record any issues.",
            "tags": []
          },
          {
            "id": "ihg-compliance-run-yahoo-finance",
            "title": "Compliance run · Yahoo Finance",
            "stages": [],
            "notes": "Run compliance on Yahoo Finance’s affected IHG card placements. Attach the results and record any issues.",
            "tags": []
          },
          {
            "id": "ihg-compliance-run-frequentmiler",
            "title": "Compliance run · FrequentMiler",
            "stages": [],
            "notes": "Run compliance on FrequentMiler’s affected IHG card placements. Attach the results and record any issues.",
            "tags": []
          },
          {
            "id": "ihg-qa",
            "title": "Live QA completed by another person",
            "stages": [
              "Live QA complete"
            ],
            "notes": "At or after 5:00 am, check approved copy, live rates/terms, application links, placements, and changelog. Record any remaining exceptions.",
            "tags": []
          },
          {
            "id": "ihg-email",
            "title": "Email the IHG news summary",
            "stages": [
              "Email sent"
            ],
            "notes": "Send only after the IHG embargo lifts at 5:00 am. Summarize verified changes for every affected IHG card.",
            "tags": [
              "Embargo"
            ]
          }
        ]
      },
      {
        "id": "ihg-content",
        "title": "IHG · Content distribution",
        "tasks": [
          {
            "id": "ihg-threads",
            "title": "Threads",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified.",
            "tags": []
          },
          {
            "id": "ihg-reddit",
            "title": "Reddit",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified. Check each community’s posting rules.",
            "tags": []
          },
          {
            "id": "ihg-facebook-groups",
            "title": "Facebook Groups",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified. Check each community’s posting rules.",
            "tags": []
          },
          {
            "id": "ihg-tiktok",
            "title": "TikTok",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified.",
            "tags": []
          }
        ]
      }
    ]
  },
  {
    "id": "united",
    "kicker": "Project 04 · 06:00 am release",
    "title": "United cards",
    "groups": [
      {
        "id": "united-ops",
        "title": "06:00 am · Card updates",
        "description": "Embargo lifts before partner news is sent",
        "tasks": [
          {
            "id": "united-crawl",
            "title": "Crawl & prepare United cards",
            "stages": [
              "Crawls started"
            ],
            "notes": "Cover every affected card and partner placement; attach source snapshots and the before/after diff. Exact card list still needs confirmation.",
            "tags": [
              "Pre-launch"
            ]
          },
          {
            "id": "united-feed",
            "title": "Update the Affil feed",
            "stages": [
              "Feed changes prepared",
              "Changelog verified"
            ],
            "notes": "Check each affected card. Confirm new values and effective timing against the issuer source.",
            "tags": []
          },
          {
            "id": "united-mockups",
            "title": "Submit mockups for launch approval",
            "stages": [
              "Mockups prepared",
              "Submitted for approval",
              "Approval received & affiliate links deployed"
            ],
            "notes": "Include affected placements and updated terms. Record approval evidence before publishing.",
            "tags": []
          },
          {
            "id": "united-docs",
            "title": "Update card compliance documentation",
            "stages": [
              "Compliance changes drafted"
            ],
            "notes": "Update each card’s corresponding documentation and attach final links.",
            "tags": []
          },
          {
            "id": "united-compliance-run-nerdwallet",
            "title": "Compliance run · NerdWallet",
            "stages": [],
            "notes": "Run compliance on NerdWallet’s affected United card placements. Attach the results and record any issues.",
            "tags": []
          },
          {
            "id": "united-compliance-run-yahoo-finance",
            "title": "Compliance run · Yahoo Finance",
            "stages": [],
            "notes": "Run compliance on Yahoo Finance’s affected United card placements. Attach the results and record any issues.",
            "tags": []
          },
          {
            "id": "united-compliance-run-frequentmiler",
            "title": "Compliance run · FrequentMiler",
            "stages": [],
            "notes": "Run compliance on FrequentMiler’s affected United card placements. Attach the results and record any issues.",
            "tags": []
          },
          {
            "id": "united-qa",
            "title": "Live QA completed by another person",
            "stages": [
              "Live QA complete"
            ],
            "notes": "At or after 6:00 am, check approved copy, live rates/terms, application links, placements, and changelog. Record any remaining exceptions.",
            "tags": []
          },
          {
            "id": "united-email",
            "title": "Email the United news summary",
            "stages": [
              "Email sent"
            ],
            "notes": "Send only after the United embargo lifts at 6:00 am. Summarize verified changes for every affected United card.",
            "tags": [
              "Embargo"
            ]
          }
        ]
      },
      {
        "id": "united-content",
        "title": "United · Content distribution",
        "tasks": [
          {
            "id": "united-threads",
            "title": "Threads",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified.",
            "tags": []
          },
          {
            "id": "united-reddit",
            "title": "Reddit",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified. Check each community’s posting rules.",
            "tags": []
          },
          {
            "id": "united-facebook-groups",
            "title": "Facebook Groups",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified. Check each community’s posting rules.",
            "tags": []
          },
          {
            "id": "united-tiktok",
            "title": "TikTok",
            "stages": [
              "Content prepared",
              "Content posted"
            ],
            "notes": "Prepare per-card copy; publish only after the applicable embargo lifts and facts are verified.",
            "tags": []
          }
        ]
      }
    ]
  }
];
